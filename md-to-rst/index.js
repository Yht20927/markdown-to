#!/usr/bin/env node
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { resolveInOut, readInput, writeOutput, handleError } = require('../shared/cli');
const { stripFrontmatter } = require('../shared/frontmatter');
const { make, assertAllRestored } = require('../shared/placeholders');
const { decodeEntities } = require('../shared/entities');
const { extractFootnoteDefs } = require('../shared/footnote-defs');

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

function quoteInfo(line) {
  const match = line.match(/^(?:[ \t]*>[ \t]?)+/);
  return {
    depth: match ? (match[0].match(/>/g) || []).length : 0,
    text: match ? line.slice(match[0].length) : line
  };
}

function stripQuoteMarkers(line, depth) {
  let text = line;
  for (let i = 0; i < depth; i++) {
    const next = text.replace(/^[ \t]*>[ \t]?/, '');
    if (next === text) break;
    text = next;
  }
  return text;
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
  for (const char of text) {
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
  const inlineMath = [];
  const mathBlocks = [];
  const footnoteDefs = [];
  const linkDefs = new Map();

  let result = md.replace(/\r\n?/g, '\n');

  // Fenced code blocks, including blockquotes. RST gets a directive later.
  result = result.replace(
    /^([ \t]*(?:>[ \t]?)*)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n[ \t]*(?:>[ \t]?)*\2[ \t]*$/gm,
    (_m, prefix, _fence, info, code) => {
      const lang = info.trim().split(/\s+/)[0] || '';
      const depth = quoteInfo(prefix).depth;
      const cleaned = code.split('\n').map((line) => stripQuoteMarkers(line, depth)).join('\n');
      codeBlocks.push({ lang, code: cleaned });
      return `${prefix}${make('CODEBLOCK', codeBlocks.length - 1)}`;
    }
  );

  // Protect inline code before links/emphasis replace its contents.
  result = result.replace(/(`+)([\s\S]*?)\1/g, (_m, _ticks, code) => {
    inlineCodes.push(code);
    return make('IC', inlineCodes.length - 1);
  });

  // Display math becomes a math directive; inline math uses the Math role.
  result = result.replace(
    /^([ \t]*(?:>[ \t]?)*)\$\$[ \t]*\n([\s\S]*?)\n[ \t]*(?:>[ \t]?)*\$\$[ \t]*$/gm,
    (_m, prefix, tex) => {
      const depth = quoteInfo(prefix).depth;
      const cleaned = tex.split('\n').map((line) => stripQuoteMarkers(line, depth)).join('\n');
      mathBlocks.push(cleaned);
      return `${prefix}${make('MATHBLOCK', mathBlocks.length - 1)}`;
    }
  );
  result = result.replace(/(?<!\\)\$(?![\s$])([^\n$]*?)(?<![\s\\])\$(?!\$)/g, (_m, tex) => {
    inlineMath.push(tex);
    return make('IM', inlineMath.length - 1);
  });
  // Same-line display math has no RST block equivalent; keep it as a role.
  result = result.replace(/(?<!\\)\$\$(?![\s$])([^\n$]*?)(?<![\s\\])\$\$(?!\$)/g, (_m, tex) => {
    inlineMath.push(tex);
    return make('IM', inlineMath.length - 1);
  });

  result = extractFootnoteDefs(result, (label, content) => {
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
  result = result.replace(/<([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>/g, '$1');
  result = result.replace(/<\/?[^>]+>/g, '');
  result = decodeEntities(result);
  result = result.replace(/^([-*_])\1{2,}$/gm, '----');

  result = result.replace(/^([ \t]*(?:>[ \t]?)+)#{1,6}\s+(.+)$/gm, (_m, prefix, title) => {
    return `${prefix}**${title.replace(/[ \t]+#+[ \t]*$/, '')}**`;
  });
  result = result.replace(/^((?:[ \t]*>[ \t]?)+)([^\n]+)\n(?:[ \t]*>[ \t]?)+=+[ \t]*$/gm, (_m, prefix, title) => {
    return `${prefix}**${title}**`;
  });
  result = result.replace(/^((?:[ \t]*>[ \t]?)+)([^\n]+)\n(?:[ \t]*>[ \t]?)+-+[ \t]*$/gm, (_m, prefix, title) => {
    return `${prefix}**${title}**`;
  });

  result = result.replace(/\*\*\*([^*\n]+)\*\*\*/g, '**$1**');
  result = result.replace(/\*\*([^*\n]+)\*\*/g, '**$1**');
  result = result.replace(/__([^_\n]+)__/g, '**$1**');
  result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '*$1*');
  result = result.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '*$1*');
  result = result.replace(/~~([^~\n]+)~~/g, '$1');

  result = result.replace(/\[\^(.+?)\]/g, (_m, label) => `[#${label}]_`);

  result = result.replace(/!\[([^\]]*)\]\(\s*((?:[^()\s\\]|\\.|\([^()]*\))+)(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)/g, (_m, alt, url) => {
    return `\n\n.. image:: ${url}\n   :alt: ${alt}\n\n`;
  });
  result = result.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, text, label) => {
    const url = linkDefs.get((label || text).toLowerCase());
    return url ? `\`${text} <${url}>\`_` : text;
  });
  result = result.replace(/\[([^\]]+)\]\(\s*((?:[^()\s\\]|\\.|\([^()]*\))+)(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)/g, (_m, text, url) => `\`${text} <${url}>\`_`);

  result = result.replace(/^(\s*)[-*+]\s+/gm, '$1- ');
  result = result.replace(/^(\s*)\d+[.)]\s+/gm, '$1#. ');

  // GFM tables -> RST list-table. This runs after list conversion so the
  // list-table bullet markers are not rewritten.
  {
    const lines = result.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const header = quoteInfo(lines[i]);
      if (header.text.includes('|') && i + 1 < lines.length && isTableSeparator(quoteInfo(lines[i + 1]).text)) {
        const rows = [splitTableRow(header.text)];
        i += 2;
        while (i < lines.length) {
          const row = quoteInfo(lines[i]);
          if (!row.text.includes('|') || !row.text.trim()) break;
          rows.push(splitTableRow(row.text));
          i++;
        }
        i--;
        const indent = '    '.repeat(header.depth);
        out.push(tableToListTable(rows).split('\n').map((line) => (line ? indent + line : line)).join('\n'));
        continue;
      }
      out.push(lines[i]);
    }
    result = out.join('\n');
  }

  result = result.replace(/((?:^>[^\n]*\n?)+)/gm, (match) => {
    const lines = match.trimEnd().split('\n').map((line) => {
      const marker = line.match(/^(?:>[ \t]?)+/);
      const depth = marker ? (marker[0].match(/>/g) || []).length : 1;
      return '    '.repeat(depth) + line.replace(/^(?:>[ \t]?)+/, '');
    });
    return lines.join('\n') + '\n';
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
    const placeholder = make('CODEBLOCK', i);
    result = result.split('\n').map((line) => {
      if (line.trim() !== placeholder) return line;
      const indent = line.slice(0, line.indexOf(placeholder));
      const header = cb.lang ? `.. code:: ${cb.lang}` : '.. code::';
      const indented = cb.code.split('\n').map((bodyLine) => `${indent}   ${bodyLine}`).join('\n');
      return `${indent}${header}\n\n${indented}`;
    }).join('\n');
  }
  for (let i = 0; i < inlineMath.length; i++) {
    result = result.split(make('IM', i)).join(`:math:\`${inlineMath[i]}\``);
  }
  for (let i = 0; i < mathBlocks.length; i++) {
    const placeholder = make('MATHBLOCK', i);
    result = result.split('\n').map((line) => {
      if (line.trim() !== placeholder) return line;
      const indent = line.slice(0, line.indexOf(placeholder));
      const body = mathBlocks[i].split('\n').map((bodyLine) => `${indent}   ${bodyLine}`);
      return [`${indent}.. math::`, '', ...body].join('\n');
    }).join('\n');
  }

  // Headings are expanded last so inline markup (code/math/links) has been
  // restored before the underline width is measured.
  for (let level = 1; level <= 6; level++) {
    const marker = '#'.repeat(level);
    result = result.replace(new RegExp(`^${marker}\\s+(.+)$`, 'gm'), (_m, title) => {
      const text = title.replace(/[ \t]+#+[ \t]*$/, '');
      const underline = HEADING_CHARS[level - 1].repeat(displayWidth(text.trim()));
      return `${text}\n${underline}`;
    });
  }

  assertAllRestored(result);
  return result.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trimEnd();
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
