#!/usr/bin/env node
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { resolveInOut, readInput, writeOutput, handleError } = require('../shared/cli');
const { stripFrontmatter } = require('../shared/frontmatter');
const { make, assertAllRestored } = require('../shared/placeholders');
const { decodeEntities } = require('../shared/entities');

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

function quoteDepth(prefix) {
  return (prefix.match(/>/g) || []).length;
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

function convertQuoteBlocks(text) {
  return text.replace(/^(?:[ \t]*>[^\n]*(?:\n|$))+/gm, (match) => {
    const inner = match.replace(/\n$/, '').split('\n')
      .map((line) => line.replace(/^[ \t]*>[ \t]?/, ''))
      .join('\n');
    const suffix = match.endsWith('\n') ? '\n' : '';
    return `{quote}\n${convertQuoteBlocks(inner)}\n{quote}${suffix}`;
  });
}

function mdToConfluence(md) {
  const codeBlocks = [];
  const inlineCodes = [];
  const escapedSpans = [];
  const footnoteDefs = [];
  const boldSpans = [];
  const boldItalicSpans = [];
  const italicSpans = [];
  const linkDefs = new Map();

  let result = md.replace(/\r\n?/g, '\n');

  // Extract fenced code before quote conversion so `>` markers inside code
  // blocks are preserved and never mistaken for blockquotes.
  result = result.replace(
    /^([ \t]*(?:>[ \t]?)*)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n[ \t]*(?:>[ \t]?)*\2[ \t]*$/gm,
    (_m, prefix, _fence, info, code) => {
      const lang = info.trim().split(/\s+/)[0] || '';
      const depth = quoteDepth(prefix);
      const cleaned = code.split('\n').map((line) => stripQuoteMarkers(line, depth)).join('\n');
      codeBlocks.push({ lang, code: cleaned });
      return `${prefix}${make('CODEBLOCK', codeBlocks.length - 1)}`;
    }
  );

  // Unwrap blockquotes before block processing so headings, lists, tables and
  // nested quotes inside them are converted normally.
  result = convertQuoteBlocks(result);

  result = result.replace(/(`+)([\s\S]*?)\1/g, (_m, _ticks, code) => {
    inlineCodes.push(code);
    return make('IC', inlineCodes.length - 1);
  });

  // Escaped Markdown characters stay literal and must not be parsed as
  // emphasis, links or list markers.
  result = result.replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, (_m, char) => {
    escapedSpans.push(char);
    return make('ESC', escapedSpans.length - 1);
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
  result = result.replace(/<([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>/g, '$1');
  result = result.replace(/<\/?[^>]+>/g, '');
  result = decodeEntities(result);

  result = result.replace(/^(?!\s*(?:[-*+]\s|\d+[.)]\s|>|#|\||\x00))([^\n]*\S[^\n]*)\n=+[ \t]*$/gm, '# $1');
  result = result.replace(/^(?!\s*(?:[-*+]\s|\d+[.)]\s|>|#|\||\x00))([^\n]*\S[^\n]*)\n-+[ \t]*$/gm, '## $1');
  result = result.replace(/^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/gm, (_m, hashes, title) => `h${hashes.length}. ${title}`);

  result = result.replace(/\*\*\*([^*\n]+)\*\*\*/g, (_m, text) => {
    boldItalicSpans.push(text);
    return make('BOLDITALIC', boldItalicSpans.length - 1);
  });
  // Italic first so emphasis nested inside bold is not swallowed as literal text.
  result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_m, text) => {
    italicSpans.push(text);
    return make('IM', italicSpans.length - 1);
  });
  result = result.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, (_m, text) => {
    italicSpans.push(text);
    return make('IM', italicSpans.length - 1);
  });
  result = result.replace(/\*\*((?:[^*\n]|\*(?!\*))+)\*\*/g, (_m, text) => {
    boldSpans.push(text);
    return make('BOLD', boldSpans.length - 1);
  });
  result = result.replace(/(?<!\w)__((?:[^_\n]|_(?!_))+?)__(?!\w)/g, (_m, text) => {
    boldSpans.push(text);
    return make('BOLD', boldSpans.length - 1);
  });
  result = result.replace(/~~([^~\n]+)~~/g, '-$1-');

  result = result.replace(/\[\^(.+?)\]/g, (_m, label) => `[fn:${label}]`);

  const LINK_PIPE = '\u0001PIPE\u0001';
  const inlineTarget = String.raw`\s*((?:[^()\s\\]|\\.|\([^()]*\))+)(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*`;
  result = result.replace(new RegExp(String.raw`!\[([^\]]*)\]\(${inlineTarget}\)`, 'g'), (_m, _alt, url) => `!${url}!`);
  result = result.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, text, label) => {
    const url = linkDefs.get((label || text).toLowerCase());
    return url ? `[${text}${LINK_PIPE}${url}]` : text;
  });
  result = result.replace(new RegExp(String.raw`\[([^\]]+)\]\(${inlineTarget}\)`, 'g'), (_m, text, url) => `[${text}${LINK_PIPE}${url}]`);

  result = result.replace(/^([ \t]*)[-*+][ \t]+/gm, (_m, indent) => {
    const level = Math.floor(indent.replace(/\t/g, '  ').length / 2) + 1;
    return '*'.repeat(level) + ' ';
  });
  result = result.replace(/^([ \t]*)\d+[.)][ \t]+/gm, (_m, indent) => {
    const level = Math.floor(indent.replace(/\t/g, '  ').length / 2) + 1;
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
  for (let i = 0; i < escapedSpans.length; i++) {
    result = result.split(make('ESC', i)).join('\\' + escapedSpans[i]);
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
