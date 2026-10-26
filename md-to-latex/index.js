#!/usr/bin/env node
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { stripFrontmatter } = require('../shared/frontmatter');
const { make, assertAllRestored } = require('../shared/placeholders');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

function escapeLatex(str) {
  const BS = '\u0001BS\u0001';
  return str
    .replace(/\\/g, BS)
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/</g, '$<$')
    .replace(/>/g, '$>$')
    .split(BS).join('\\textbackslash{}');
}

function unescapeMarkdown(str) {
  return str.replace(/\\([\\`*{}\[\]()#+\-.!_>~|$%&])/g, '$1');
}

function escapeLatexUrl(str) {
  return str
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([%#&{}])/g, '\\$1');
}

function splitTableRow(row) {
  const trimmed = row.replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
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
  return /^\|?[\s:|-]+\|[\s:|-]*$/.test(line.trim()) && line.includes('-');
}

function parseTable(tableText) {
  const lines = tableText.trim().split('\n').map((line) => line.trim());
  if (lines.length < 2) return null;
  const header = splitTableRow(lines[0]);
  const sep = splitTableRow(lines[1]);
  if (header.length === 0 || sep.length === 0) return null;
  const aligns = sep.map((cell) => {
    const value = cell.trim();
    if (value.startsWith(':') && value.endsWith(':')) return 'c';
    if (value.endsWith(':')) return 'r';
    return 'l';
  });
  return { header, aligns, rows: lines.slice(2).map(splitTableRow) };
}

function renderInline(text, context) {
  const tokens = [];
  const protect = (value) => {
    tokens.push(value);
    return make('CB', tokens.length - 1);
  };

  let result = text;

  // Code spans are literal; their contents must never be parsed as Markdown.
  result = result.replace(/(`+)([\s\S]*?)\1/g, (_m, _ticks, code) => {
    return protect('\\texttt{' + escapeLatex(code) + '}');
  });

  // Math is already LaTeX; keep it verbatim.
  result = result.replace(/(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$/g, (_m, tex) => protect('$$' + tex + '$$'));
  result = result.replace(/(?<!\\)\$(?![\s$])([^\n$]*?)(?<![\s\\])\$(?!\$)/g, (_m, tex) => protect('$' + tex + '$'));

  // Images before links.
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    return protect(`\\includegraphics[width=\\linewidth]{${escapeLatexUrl(url)}}`);
  });

  result = result.replace(/\[\^([^\]]+)\]/g, (_m, label) => {
    const content = context.footnotes.get(label);
    if (content === undefined) return protect('\\footnote{' + escapeLatex(label) + '}');
    return protect('\\footnote{' + renderInline(content, context) + '}');
  });

  result = result.replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (_m, alt, label) => {
    const url = context.links.get((label || alt).toLowerCase());
    return protect(url ? `\\includegraphics[width=\\linewidth]{${escapeLatexUrl(url)}}` : '');
  });
  result = result.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (_m, labelText, label) => {
    const url = context.links.get((label || labelText).toLowerCase());
    if (!url) return renderInline(labelText, context);
    return protect(`\\href{${escapeLatexUrl(url)}}{${renderInline(labelText, context)}}`);
  });
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, labelText, url) => {
    return protect(`\\href{${escapeLatexUrl(url)}}{${renderInline(labelText, context)}}`);
  });

  result = result.replace(/\*\*\*([^*\n]+)\*\*\*/g, (_m, inner) => {
    return protect('\\textbf{\\textit{' + renderInline(inner, context) + '}}');
  });
  result = result.replace(/\*\*([^*\n]+)\*\*/g, (_m, inner) => {
    return protect('\\textbf{' + renderInline(inner, context) + '}');
  });
  result = result.replace(/(?<!\w)__([^_\n]+)__(?!\w)/g, (_m, inner) => {
    return protect('\\textbf{' + renderInline(inner, context) + '}');
  });
  result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_m, inner) => {
    return protect('\\textit{' + renderInline(inner, context) + '}');
  });
  result = result.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, (_m, inner) => {
    return protect('\\textit{' + renderInline(inner, context) + '}');
  });
  result = result.replace(/~~([^~\n]+)~~/g, (_m, inner) => {
    return protect('\\sout{' + renderInline(inner, context) + '}');
  });

  result = result.replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gi, (_m, url) => {
    return protect('\\url{' + escapeLatexUrl(url.replace(/^mailto:/i, '')) + '}');
  });
  result = result.replace(/<\/?[^>]+>/g, '');

  result = escapeLatex(unescapeMarkdown(result));
  for (let i = 0; i < tokens.length; i++) {
    result = result.split(make('CB', i)).join(tokens[i]);
  }
  return result;
}

function markdownTableToLatex(tableText, context) {
  const table = parseTable(tableText);
  if (!table) return escapeLatex(tableText);

  const { header, aligns, rows } = table;
  const spec = '|' + aligns.map((align) => align).join('|') + '|';
  const renderCell = (cell) => renderInline(cell.replace(/\\\|/g, '|'), context).replace(/\|/g, '\\textbar{}');

  let out = '\\begin{tabular}{' + spec + '}\n\\hline\n';
  out += header.map(renderCell).join(' & ') + ' \\\\\n\\hline\n';
  for (const row of rows) {
    const cells = row.slice();
    while (cells.length < header.length) cells.push('');
    out += cells.map(renderCell).join(' & ') + ' \\\\\n';
  }
  out += '\\hline\n\\end{tabular}\n';
  return out;
}

function joinListContinuations(md) {
  let result = md;
  for (let i = 0; i < 4; i++) {
    const next = result.replace(
      /^(\s*(?:[-*+]|\d+[.)])\s+[^\n]*)\n([ \t]{2,})(?![ \t]*(?:[-*+]|\d+[.)]|`{3,}|~{3,}))([^\n]+)$/gm,
      '$1 $3'
    );
    if (next === result) break;
    result = next;
  }
  return result;
}

function processBlocks(md, context, { inQuote = false } = {}) {
  const lines = md.split('\n');
  const out = [];
  let quote = [];

  const flushQuote = () => {
    if (quote.length === 0) return;
    const inner = nestLists(processBlocks(quote.join('\n'), context, { inQuote: true }));
    out.push('\\begin{quote}');
    out.push(...inner.split('\n'));
    out.push('\\end{quote}');
    quote = [];
  };

  for (const line of lines) {
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      quote.push(quoteMatch[1]);
      continue;
    }
    flushQuote();

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const content = renderInline(heading[2], context);
      if (inQuote) {
        out.push('\\textbf{' + content + '}');
      } else {
        const level = heading[1].length;
        const commands = ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'subparagraph'];
        out.push('\\' + commands[level - 1] + '{' + content + '}');
      }
      continue;
    }

    const ul = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ul) {
      const task = ul[2].match(/^\[([ xX])\]\s*(.*)$/);
      const text = task
        ? (task[1].toLowerCase() === 'x' ? '$\\checkmark$ ' : '$\\square$ ') + task[2]
        : ul[2];
      out.push(ul[1] + '\\uitem ' + renderInline(text, context));
      continue;
    }

    const ol = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
    if (ol) {
      out.push(ol[1] + '\\oitem ' + renderInline(ol[2], context));
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push('\\hrulefill');
      continue;
    }

    out.push(renderInline(line, context));
  }
  flushQuote();
  return out.join('\n');
}

function nestLists(text) {
  const lines = text.split('\n');
  const out = [];
  const stack = [];

  for (const line of lines) {
    const item = line.match(/^(\s*)\\([ou]item)\s/);
    if (!item) {
      while (stack.length > 0) out.push('\\end{' + stack.pop().type + '}');
      out.push(line);
      continue;
    }

    const indent = item[1].length;
    const type = item[2] === 'oitem' ? 'enumerate' : 'itemize';

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (top.indent < indent) break;
      if (top.indent === indent && top.type === type) break;
      out.push('\\end{' + stack.pop().type + '}');
    }

    if (stack.length === 0 || stack[stack.length - 1].type !== type || stack[stack.length - 1].indent < indent) {
      out.push('\\begin{' + type + '}');
      stack.push({ indent, type });
    }
    out.push(line.replace(/\\[ou]item/, '\\item'));
  }

  while (stack.length > 0) out.push('\\end{' + stack.pop().type + '}');
  return out.join('\n');
}

function mdToLatex(md) {
  const codeBlocks = [];
  const mathBlocks = [];
  const tables = [];
  const footnotes = new Map();
  const links = new Map();
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

  result = result.replace(
    /^[ \t]*(?:>[ \t]?)*\$\$[ \t]*\n([\s\S]*?)\n[ \t]*(?:>[ \t]?)*\$\$[ \t]*$/gm,
    (_m, tex) => {
      const cleaned = tex.split('\n').map((line) => line.replace(/^[ \t]*>[ \t]?/, '')).join('\n');
      mathBlocks.push(cleaned);
      return make('MATHBLOCK', mathBlocks.length - 1);
    }
  );

  result = result.replace(/^\[\^(.+?)\]:\s*(.*)$/gm, (_m, label, content) => {
    footnotes.set(label, content);
    return '';
  });
  result = result.replace(/^\[([^\]]+)\]:\s*(\S+)(?:\s+["'(].*["')])?\s*$/gm, (_m, label, url) => {
    links.set(label.toLowerCase(), url);
    return '';
  });

  // Protect tables before inline/block processing.
  {
    const lines = result.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        const tableLines = [lines[i], lines[i + 1]];
        i += 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          tableLines.push(lines[i]);
          i++;
        }
        i--;
        tables.push(tableLines.join('\n'));
        out.push(make('TABLE', tables.length - 1));
        continue;
      }
      out.push(lines[i]);
    }
    result = out.join('\n');
  }

  result = joinListContinuations(result);
  result = processBlocks(result, { footnotes, links });
  result = nestLists(result);

  for (let i = 0; i < tables.length; i++) {
    result = result.split(make('TABLE', i)).join(markdownTableToLatex(tables[i], { footnotes, links }));
  }
  for (let i = 0; i < codeBlocks.length; i++) {
    const cb = codeBlocks[i];
    const langOpt = cb.lang ? `[language={${cb.lang.replace(/[^\w+-]/g, '')}}]` : '';
    result = result.split(make('CODEBLOCK', i)).join(`\\begin{lstlisting}${langOpt}\n${cb.code}\n\\end{lstlisting}`);
  }
  for (let i = 0; i < mathBlocks.length; i++) {
    result = result.split(make('MATHBLOCK', i)).join(`\\[\n${mathBlocks[i]}\n\\]`);
  }

  assertAllRestored(result);
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(result);
  const docClass = hasCJK ? 'ctexart' : 'article';
  const cjkPackages = hasCJK ? `\n\\usepackage{geometry}\n\\geometry{a4paper, margin=2.5cm}` : '';

  return `\\documentclass{${docClass}}
\\usepackage{hyperref}
\\usepackage{graphicx}
\\usepackage{listings}
\\usepackage{xcolor}
\\usepackage[normalem]{ulem}
\\usepackage{amssymb}${cjkPackages}

\\begin{document}

${result}

\\end{document}
`;
}

program
  .name('md-to-latex')
  .description('Convert Markdown to LaTeX')
  .version(pkg.version);

program.command('convert')
  .description('Convert a Markdown file to LaTeX')
  .requiredOption('-i, --input <file>', 'Input Markdown file')
  .requiredOption('-o, --output <file>', 'Output .tex file')
  .action(async (opts) => {
    const input = path.resolve(opts.input);
    const output = path.resolve(opts.output);
    if (!fs.existsSync(input)) { console.error('Input file not found'); process.exit(1); }
    const md = stripFrontmatter(fs.readFileSync(input, 'utf-8'));
    const result = mdToLatex(md);
    fs.writeFileSync(output, result, 'utf-8');
    console.log(`Done: ${output} (${result.length} chars)`);
  });

program.parse();
