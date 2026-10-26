#!/usr/bin/env node
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { resolveInOut, readInput, writeOutput, handleError } = require('../shared/cli');
const { stripFrontmatter } = require('../shared/frontmatter');
const { make, assertAllRestored } = require('../shared/placeholders');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

const HEADING_CHARS = ['=', '-', '~', '^', '"', "'"];

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i++;
    } else if (trimmed[i] === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += trimmed[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

function isTableSeparator(line) {
  if (!line.includes('-') || !line.includes('|')) return false;
  return splitTableRow(line).every((cell) => /^:?-{1,}:?$/.test(cell));
}

function tableToListTable(rows) {
  const header = rows[0].map((cell) => cell.trim());
  const body = rows.slice(1);
  const lines = ['.. list-table::', '   :header-rows: 1', ''];
  for (const row of [header, ...body]) {
    const cells = row.slice();
    while (cells.length < header.length) cells.push('');
    cells.forEach((cell, index) => {
      lines.push(`${index === 0 ? '   *' : '     '} - ${cell}`);
    });
  }
  return lines.join('\n');
}

function displayWidth(text) {
  let width = 0;
  for (const char of text.replace(/[*_`~]/g, '')) {
    const code = char.codePointAt(0);
    const wide = code >= 0x1100 && (
      code <= 0x115f ||
      code === 0x2329 || code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    );
    width += wide ? 2 : 1;
  }
  return width;
}

function mdToRst(md) {
  const codeBlocks = [];
  const inlineCodes = [];
  const footnoteDefs = [];
  const linkDefs = new Map();

  let result = md.replace(/\r\n?/g, '\n');

  // Fenced code blocks, including blockquotes. RST gets a directive later.
  result = result.replace(
    /^[ \t]*(?:>[ \t]?)*(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n[ \t]*(?:>[ \t]?)*\1[ \t]*$/gm,
    (_m, _fence, info, code) => {
      const lang = info.trim().split(/\s+/)[0] || '';
      const cleaned = code.split('\n').map((line) => line.replace(/^[ \t]*>[ \t]?/, '')).join('\n');
      codeBlocks.push({ lang, code: cleaned });
      return make('CODEBLOCK', codeBlocks.length - 1);
    }
  );

  // Protect inline code before links/emphasis replace its contents.
  result = result.replace(/(`+)([\s\S]*?)\1/g, (_m, _ticks, code) => {
    inlineCodes.push(code);
    return make('IC', inlineCodes.length - 1);
  });

  result = result.replace(/^\[\^(.+?)\]:\s*(.*)$/gm, (_m, label, content) => {
    footnoteDefs.push({ label, content });
    return make('FNDEF', footnoteDefs.length - 1);
  });

  result = result.replace(/^\[([^\]]+)\]:\s*(\S+)(?:\s+["'(].*["')])?\s*$/gm, (_m, label, url) => {
    linkDefs.set(label.toLowerCase(), url);
    return '';
  });

  // Raw HTML is stripped before RST links are generated (their <url>
  // syntax would otherwise be mistaken for an HTML tag).
  result = result.replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gi, (_m, url) => {
    return url.replace(/^mailto:/i, '');
  });
  result = result.replace(/<\/?[^>]+>/g, '');
  result = result.replace(/^([-*_])\1{2,}$/gm, '----');

  result = result.replace(/^######\s+(.+)$/gm, (_m, title) => {
    const underline = HEADING_CHARS[5].repeat(displayWidth(title.trim()));
    return `${title}\n${underline}`;
  });
  result = result.replace(/^#####\s+(.+)$/gm, (_m, title) => {
    const underline = HEADING_CHARS[4].repeat(displayWidth(title.trim()));
    return `${title}\n${underline}`;
  });
  result = result.replace(/^####\s+(.+)$/gm, (_m, title) => {
    const underline = HEADING_CHARS[3].repeat(displayWidth(title.trim()));
    return `${title}\n${underline}`;
  });
  result = result.replace(/^###\s+(.+)$/gm, (_m, title) => {
    const underline = HEADING_CHARS[2].repeat(displayWidth(title.trim()));
    return `${title}\n${underline}`;
  });
  result = result.replace(/^##\s+(.+)$/gm, (_m, title) => {
    const underline = HEADING_CHARS[1].repeat(displayWidth(title.trim()));
    return `${title}\n${underline}`;
  });
  result = result.replace(/^#\s+(.+)$/gm, (_m, title) => {
    const underline = HEADING_CHARS[0].repeat(displayWidth(title.trim()));
    return `${title}\n${underline}`;
  });

  result = result.replace(/\*\*\*([^*\n]+)\*\*\*/g, '**$1**');
  result = result.replace(/\*\*([^*\n]+)\*\*/g, '**$1**');
  result = result.replace(/__([^_\n]+)__/g, '**$1**');
  result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '*$1*');
  result = result.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '*$1*');
  result = result.replace(/~~([^~\n]+)~~/g, '$1');

  result = result.replace(/\[\^(.+?)\]/g, (_m, label) => `[#${label}]_`);

  result = result.replace(/!\[(.+?)\]\((.+?)\)/g, (_m, alt, url) => {
    return `\n\n.. image:: ${url}\n   :alt: ${alt}\n\n`;
  });
  result = result.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, text, label) => {
    const url = linkDefs.get((label || text).toLowerCase());
    return url ? `\`${text} <${url}>\`_` : text;
  });
  result = result.replace(/\[([^\]]+)\]\((.+?)\)/g, (_m, text, url) => `\`${text} <${url}>\`_`);

  result = result.replace(/^(\s*)[-*+]\s+/gm, '$1- ');
  result = result.replace(/^(\s*)\d+[.)]\s+/gm, '$1#. ');

  // GFM tables -> RST list-table. This runs after list conversion so the
  // list-table bullet markers are not rewritten.
  {
    const lines = result.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        const rows = [splitTableRow(lines[i])];
        i += 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          rows.push(splitTableRow(lines[i]));
          i++;
        }
        i--;
        out.push(tableToListTable(rows));
        continue;
      }
      out.push(lines[i]);
    }
    result = out.join('\n');
  }

  result = result.replace(/((?:^>[^\n]*\n?)+)/gm, (match) => {
    const lines = match.trimEnd().split('\n').map((line) => line.replace(/^>\s?/, ''));
    return lines.map((line) => '    ' + line).join('\n') + '\n';
  });

  for (let i = 0; i < footnoteDefs.length; i++) {
    const fn = footnoteDefs[i];
    result = result.split(make('FNDEF', i)).join(`.. [#${fn.label}] ${fn.content}`);
  }
  for (let i = 0; i < inlineCodes.length; i++) {
    result = result.split(make('IC', i)).join('``' + inlineCodes[i] + '``');
  }
  for (let i = 0; i < codeBlocks.length; i++) {
    const cb = codeBlocks[i];
    const header = cb.lang ? `.. code:: ${cb.lang}` : '.. code::';
    const indented = cb.code.split('\n').map((line) => '   ' + line).join('\n');
    result = result.split(make('CODEBLOCK', i)).join(`${header}\n\n${indented}`);
  }

  assertAllRestored(result);
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

program
  .name('md-to-rst')
  .description('Convert Markdown to reStructuredText')
  .version(pkg.version);

program.command('convert')
  .description('Convert a Markdown file to RST')
  .requiredOption('-i, --input <file>', 'Input Markdown file')
  .requiredOption('-o, --output <file>', 'Output .rst file')
  .action(async (opts) => {
    try {
      const { input, output } = resolveInOut(opts);
      const md = stripFrontmatter(readInput(input));
      const result = mdToRst(md);
      writeOutput(output, result.endsWith('\n') ? result : result + '\n');
    } catch (e) { handleError(e); }
  });

program.parse();
