#!/usr/bin/env node
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { resolveInOut, readInput, writeOutput, handleError } = require('../shared/cli');
const { stripFrontmatter } = require('../shared/frontmatter');
const { make, assertAllRestored } = require('../shared/placeholders');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

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
  if (!line.includes('|') || !line.includes('-')) return false;
  return splitTableRow(line).every((cell) => /^:?-{1,}:?$/.test(cell));
}

function tableToConfluence(rows) {
  const [header, ...body] = rows;
  const lines = [];
  lines.push('||' + header.map((cell) => cell.replace(/\|/g, '\\|')).join('||') + '||');
  for (const row of body) {
    const cells = row.slice();
    while (cells.length < header.length) cells.push('');
    lines.push('|' + cells.map((cell) => cell.replace(/\|/g, '\\|')).join('|') + '|');
  }
  return lines.join('\n');
}

function mdToConfluence(md) {
  const codeBlocks = [];
  const inlineCodes = [];
  const footnoteDefs = [];
  const boldSpans = [];
  const boldItalicSpans = [];
  const italicSpans = [];
  const linkDefs = new Map();

  let result = md.replace(/\r\n?/g, '\n');

  result = result.replace(
    /^[ \t]*(?:>[ \t]?)*(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n[ \t]*(?:>[ \t]?)*\1[ \t]*$/gm,
    (_m, _fence, info, code) => {
      const lang = info.trim().split(/\s+/)[0] || '';
      const cleaned = code.split('\n').map((line) => line.replace(/^[ \t]*>[ \t]?/, '')).join('\n');
      codeBlocks.push({ lang, code: cleaned });
      return make('CODEBLOCK', codeBlocks.length - 1);
    }
  );

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

  result = result.replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gi, (_m, url) => url.replace(/^mailto:/i, ''));
  result = result.replace(/<\/?[^>]+>/g, '');

  result = result.replace(/^######\s+(.+)$/gm, 'h6. $1');
  result = result.replace(/^#####\s+(.+)$/gm, 'h5. $1');
  result = result.replace(/^####\s+(.+)$/gm, 'h4. $1');
  result = result.replace(/^###\s+(.+)$/gm, 'h3. $1');
  result = result.replace(/^##\s+(.+)$/gm, 'h2. $1');
  result = result.replace(/^#\s+(.+)$/gm, 'h1. $1');

  result = result.replace(/\*\*\*([^*\n]+)\*\*\*/g, (_m, text) => {
    boldItalicSpans.push(text);
    return make('BOLDITALIC', boldItalicSpans.length - 1);
  });
  result = result.replace(/\*\*([^*\n]+)\*\*/g, (_m, text) => {
    boldSpans.push(text);
    return make('BOLD', boldSpans.length - 1);
  });
  result = result.replace(/(?<!\w)__([^_\n]+)__(?!\w)/g, (_m, text) => {
    boldSpans.push(text);
    return make('BOLD', boldSpans.length - 1);
  });
  result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_m, text) => {
    italicSpans.push(text);
    return make('IM', italicSpans.length - 1);
  });
  result = result.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, (_m, text) => {
    italicSpans.push(text);
    return make('IM', italicSpans.length - 1);
  });
  result = result.replace(/~~([^~\n]+)~~/g, '-$1-');

  result = result.replace(/\[\^(.+?)\]/g, (_m, label) => `[fn:${label}]`);

  const LINK_PIPE = '\u0001PIPE\u0001';
  result = result.replace(/!\[(.+?)\]\((.+?)\)/g, '!$2!');
  result = result.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, text, label) => {
    const url = linkDefs.get((label || text).toLowerCase());
    return url ? `[${text}${LINK_PIPE}${url}]` : text;
  });
  result = result.replace(/\[([^\]]+)\]\((.+?)\)/g, (_m, text, url) => `[${text}${LINK_PIPE}${url}]`);

  result = result.replace(/^(\s*)[-*+]\s+/gm, (_m, indent) => {
    const level = Math.floor(indent.length / 2) + 1;
    return '*'.repeat(level) + ' ';
  });
  result = result.replace(/^(\s*)\d+[.)]\s+/gm, (_m, indent) => {
    const level = Math.floor(indent.length / 2) + 1;
    return '#'.repeat(level) + ' ';
  });
  result = result.replace(/^([-*_])\1{2,}$/gm, '----');

  // GFM tables -> Confluence table markup. Run after list conversion so the
  // generated table markers are not rewritten as list items.
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
        out.push(tableToConfluence(rows));
        continue;
      }
      out.push(lines[i]);
    }
    result = out.join('\n');
  }

  result = result.split(LINK_PIPE).join('|');

  result = result.replace(/((?:^>[^\n]*\n?)+)/gm, (match) => {
    const lines = match.trimEnd().split('\n').map((line) => line.replace(/^>\s?/, ''));
    return lines.map((line) => 'bq. ' + line).join('\n') + '\n';
  });

  for (let i = 0; i < footnoteDefs.length; i++) {
    const fn = footnoteDefs[i];
    result = result.split(make('FNDEF', i)).join(`[fn:${fn.label}] ${fn.content}`);
  }
  for (let i = 0; i < inlineCodes.length; i++) {
    result = result.split(make('IC', i)).join('{{' + inlineCodes[i] + '}}');
  }
  for (let i = 0; i < boldItalicSpans.length; i++) {
    result = result.split(make('BOLDITALIC', i)).join('*_' + boldItalicSpans[i] + '_*');
  }
  for (let i = 0; i < boldSpans.length; i++) {
    result = result.split(make('BOLD', i)).join('*' + boldSpans[i] + '*');
  }
  for (let i = 0; i < italicSpans.length; i++) {
    result = result.split(make('IM', i)).join('_' + italicSpans[i] + '_');
  }
  for (let i = 0; i < codeBlocks.length; i++) {
    const cb = codeBlocks[i];
    const langAttr = cb.lang ? `:language=${cb.lang}` : '';
    result = result.split(make('CODEBLOCK', i)).join(`\n\n{code${langAttr}}\n${cb.code}\n{code}\n\n`);
  }

  let inCodeBlock = false;
  result = result.split('\n').map((line) => {
    if (/^\s*\{code(?:[:\s]|\})/.test(line)) { inCodeBlock = true; return line; }
    if (/^\s*\{code\}\s*$/.test(line)) { inCodeBlock = false; return line; }
    if (inCodeBlock || !/^\s*\|/.test(line)) return line;
    return line.replace(/\{\{([\s\S]*?)\}\}/g, (_m, code) => `{{${code.replace(/(?<!\\)\|/g, '\\|')}}}`);
  }).join('\n');

  assertAllRestored(result);
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

program
  .name('md-to-confluence')
  .description('Convert Markdown to Confluence wiki markup')
  .version(pkg.version);

program.command('convert')
  .description('Convert a Markdown file to Confluence markup')
  .requiredOption('-i, --input <file>', 'Input Markdown file')
  .requiredOption('-o, --output <file>', 'Output file')
  .action(async (opts) => {
    try {
      const { input, output } = resolveInOut(opts);
      const md = stripFrontmatter(readInput(input));
      const result = mdToConfluence(md);
      writeOutput(output, result.endsWith('\n') ? result : result + '\n');
    } catch (e) { handleError(e); }
  });

program.parse();
