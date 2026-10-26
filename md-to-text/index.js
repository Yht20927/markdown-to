#!/usr/bin/env node
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { resolveInOut, readInput, writeOutput, handleError } = require('../shared/cli');
const { stripFrontmatter } = require('../shared/frontmatter');
const { make, assertAllRestored } = require('../shared/placeholders');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

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
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell));
}

function formatTableRow(line) {
  return splitTableRow(line).join(' | ');
}

function markdownToText(md) {
  const codeBlocks = [];
  const inlineCodes = [];
  const mathSpans = [];
  const footnoteDefs = [];
  const linkDefs = new Map();

  let result = md.replace(/\r\n?/g, '\n');

  // Fenced code blocks first, including blockquote/list-indented fences.
  result = result.replace(
    /^[ \t]*(?:>[ \t]?)*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n[ \t]*(?:>[ \t]?)*\1[ \t]*$/gm,
    (_m, _fence, code) => {
      const cleaned = code.split('\n').map((line) => line.replace(/^[ \t]*>[ \t]?/, '')).join('\n');
      codeBlocks.push(cleaned);
      return make('CB', codeBlocks.length - 1);
    }
  );

  // Inline code and math are protected from emphasis/link stripping.
  result = result.replace(/`([^`\n]+)`/g, (_m, code) => {
    inlineCodes.push(code);
    return make('IC', inlineCodes.length - 1);
  });
  result = result.replace(/(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g, (_m, tex) => {
    mathSpans.push(tex.trim());
    return make('BM', mathSpans.length - 1);
  });
  result = result.replace(/(?<!\\)\$(?![\s$])([^\n$]*?)(?<![\s\\])\$(?!\$)/g, (_m, tex) => {
    mathSpans.push(tex.trim());
    return make('IM', mathSpans.length - 1);
  });

  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  result = result.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  result = result.replace(/<!--[\s\S]*?-->/g, '');

  result = result.replace(/^\[\^(.+?)\]:\s*(.*)$/gm, (_m, label, content) => {
    footnoteDefs.push({ label, content });
    return '';
  });

  result = result.replace(/^\[([^\]]+)\]:\s*(\S+)(?:\s+["'(].*["')])?\s*$/gm, (_m, label, url) => {
    linkDefs.set(label.toLowerCase(), url);
    return '';
  });

  result = result.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  result = result.replace(/!\[[^\]]*\]\[[^\]]*\]/g, '');

  result = result.replace(/\[\^([^\]]+)\]/g, '[$1]');
  result = result.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (_m, text, label) => {
    const key = (label || text).toLowerCase();
    return linkDefs.has(key) ? text : text;
  });
  result = result.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  result = result.replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gi, (_m, url) => url.replace(/^mailto:/i, ''));
  result = result.replace(/<br\s*\/?>/gi, '\n');
  result = result.replace(/<\/?[^>]+>/g, '');

  result = result.replace(/^#{1,6}\s+/gm, '');
  result = result.replace(/^\s*(?:>\s?)+/gm, '');
  result = result.replace(/^\s*(?:([-*_])\1{2,}|={3,})\s*$/gm, '');

  // GFM tables: keep readable rows and drop the separator line.
  {
    const lines = result.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        out.push(formatTableRow(lines[i]));
        i += 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          out.push(formatTableRow(lines[i]));
          i++;
        }
        i--;
        continue;
      }
      out.push(lines[i]);
    }
    result = out.join('\n');
  }

  result = result.replace(/^(\s*)[-*+]\s+(.+)$/gm, '$1• $2');
  result = result.replace(/^(\s*)(\d+)[.)]\s+(.+)$/gm, '$1$2. $3');

  result = result.replace(/\*\*\*([^*\n]+)\*\*\*/g, '$1');
  result = result.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
  result = result.replace(/(?<!\w)__([^_\n]+)__(?!\w)/g, '$1');
  result = result.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1');
  result = result.replace(/~~([^~\n]+)~~/g, '$1');

  result = result.replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, '$1');
  result = decodeEntities(result);
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  for (let i = 0; i < mathSpans.length; i++) {
    result = result.split(make('BM', i)).join(mathSpans[i]);
    result = result.split(make('IM', i)).join(mathSpans[i]);
  }
  for (let i = 0; i < inlineCodes.length; i++) {
    result = result.split(make('IC', i)).join(inlineCodes[i]);
  }
  for (let i = 0; i < codeBlocks.length; i++) {
    result = result.split(make('CB', i)).join('\n' + codeBlocks[i] + '\n');
  }

  if (footnoteDefs.length > 0) {
    const notes = footnoteDefs.map(({ label, content }) => `[${label}] ${content}`).join('\n');
    result = result ? `${result}\n\n${notes}` : notes;
  }

  assertAllRestored(result);
  return result.trim();
}

program
  .name('md-to-text')
  .description('Convert Markdown to clean plain text')
  .version(pkg.version);

program.command('convert')
  .description('Convert a Markdown file to plain text')
  .requiredOption('-i, --input <file>', 'Input Markdown file')
  .requiredOption('-o, --output <file>', 'Output text file')
  .action(async (opts) => {
    try {
      const { input, output } = resolveInOut(opts);
      const md = stripFrontmatter(readInput(input));
      const text = markdownToText(md);
      writeOutput(output, text.endsWith('\n') ? text : text + '\n');
    } catch (e) { handleError(e); }
  });

program.parse();
