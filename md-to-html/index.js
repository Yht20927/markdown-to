#!/usr/bin/env node
const { program } = require('commander');
const { Marked } = require('marked');
const katex = require('katex');
const hljs = require('highlight.js');
const { createRenderer } = require('../shared/html-renderer');
const { buildHtmlPage } = require('../shared/html-page');
const { stripFrontmatter } = require('../shared/frontmatter');
const fs = require('fs');
const path = require('path');

const { renderMarkdown } = createRenderer({ Marked, katex, hljs });

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

// M4: GitHub-style CSS with dark mode support via CSS variables
const lightCss = `
  :root {
    --bg: #ffffff; --text: #1F2328; --heading: #1F2328;
    --link: #0969DA; --code-bg: #F6F8FA; --code-text: #1F2328;
    --border: #D0D7DE; --quote-bg: #F6F8FA; --quote-border: #D0D7DE;
    --table-header-bg: #F6F8FA; --table-header-text: #1F2328;
    --table-border: #D0D7DE; --table-row-alt: #F6F8FA;
    --accent: #0969DA; --muted: #656D76;
  }
`;

const autoCss = lightCss + `
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0D1117; --text: #C9D1D9; --heading: #C9D1D9;
      --link: #58A6FF; --code-bg: #161B22; --code-text: #C9D1D9;
      --border: #30363D; --quote-bg: #161B22; --quote-border: #30363D;
      --table-header-bg: #161B22; --table-header-text: #C9D1D9;
      --table-border: #30363D; --table-row-alt: #161B22;
      --accent: #58A6FF; --muted: #8B949E;
    }
  }
`;

const darkCss = `
  :root {
    --bg: #0D1117; --text: #C9D1D9; --heading: #C9D1D9;
    --link: #58A6FF; --code-bg: #161B22; --code-text: #C9D1D9;
    --border: #30363D; --quote-bg: #161B22; --quote-border: #30363D;
    --table-header-bg: #161B22; --table-header-text: #C9D1D9;
    --table-border: #30363D; --table-row-alt: #161B22;
    --accent: #58A6FF; --muted: #8B949E;
  }
`;

const baseCss = `
  body {
    font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
    font-size: 16px; color: var(--text); background: var(--bg);
    line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 32px 16px;
  }
  h1 { font-size: 2em; color: var(--heading); border-bottom: 1px solid var(--border); padding-bottom: .3em; margin-top: 24px; margin-bottom: 16px; }
  h2 { font-size: 1.5em; color: var(--heading); border-bottom: 1px solid var(--border); padding-bottom: .3em; margin-top: 24px; margin-bottom: 16px; }
  h3 { font-size: 1.25em; color: var(--heading); margin-top: 24px; margin-bottom: 16px; }
  h4 { font-size: 1em; color: var(--heading); margin-top: 24px; margin-bottom: 16px; }
  h5 { font-size: .875em; color: var(--heading); } h6 { font-size: .85em; color: var(--muted); }
  a { color: var(--link); text-decoration: none; } a:hover { text-decoration: underline; }
  pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px; padding: 16px; overflow-x: auto; box-shadow: 0 1px 3px rgba(0,0,0,.08); position: relative; }
  pre code { color: var(--code-text); font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size: 13.6px; }
  code { font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size: 85%; background: var(--code-bg); padding: 2px 6px; border-radius: 4px; }
  pre code { padding: 0; background: none; }
  blockquote { border-left: 4px solid var(--accent); background: var(--quote-bg); padding: 8px 16px; color: var(--muted); margin: 12px 0; border-radius: 0 4px 4px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; border-radius: 6px; overflow: hidden; }
  th { background: var(--table-header-bg); color: var(--table-header-text); font-weight: 600; padding: 8px 12px; border: 1px solid var(--table-border); }
  td { padding: 6px 12px; border: 1px solid var(--table-border); }
  tr:nth-child(even) td { background: var(--table-row-alt); }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
  ul, ol { padding-left: 2em; }
  li + li { margin-top: 4px; }
  .katex-display { margin: 16px 0; overflow-x: auto; }
  .katex { font-size: 1.1em; }

  /* TOC sidebar */
  .toc-sidebar { position: fixed; left: 0; top: 0; width: 240px; height: 100vh; overflow-y: auto; padding: 20px; background: var(--code-bg); border-right: 1px solid var(--border); font-size: 14px; }
  .toc-sidebar + .content { margin-left: 260px; }
  .toc-sidebar ul { list-style: none; padding-left: 0; }
  .toc-sidebar li { margin-bottom: 4px; }
  .toc-sidebar a { color: var(--muted); text-decoration: none; }
  .toc-sidebar a:hover, .toc-sidebar a.active { color: var(--link); }
  .toc-sidebar .toc-H1 { font-weight: 600; }
  .toc-sidebar .toc-H2 { padding-left: 12px; }
  .toc-sidebar .toc-H3 { padding-left: 24px; }

  @media print {
    body { max-width: none; padding: 0; }
    .toc-sidebar { display: none; }
    .toc-sidebar + .content { margin-left: 0; }
  }
`;

function markdownToHtml(md, { theme = 'light' } = {}) {
  const body = renderMarkdown(md);
  const themeCss = theme === 'dark' ? darkCss : theme === 'auto' ? autoCss : lightCss;
  return buildHtmlPage({
    body,
    css: themeCss + baseCss,
    title: 'Markdown to HTML',
    lang: 'zh-CN',
  });
}

program
  .name('md-to-html')
  .description('Convert Markdown to clean HTML5')
  .version(pkg.version);

program.command('convert')
  .description('Convert a Markdown file to HTML')
  .requiredOption('-i, --input <file>', 'Input Markdown file')
  .requiredOption('-o, --output <file>', 'Output HTML file')
  .option('--theme <name>', 'Theme: light (default), dark, or auto', 'light')
  .action(async (opts) => {
    const input = path.resolve(opts.input);
    const output = path.resolve(opts.output);
    if (!fs.existsSync(input)) { console.error('Input file not found'); process.exit(1); }
    const md = stripFrontmatter(fs.readFileSync(input, 'utf-8'));
    const html = markdownToHtml(md, { theme: opts.theme });
    fs.writeFileSync(output, html, 'utf-8');
    console.log(`Done: ${output} (${Buffer.byteLength(html)} bytes)`);
  });

program.parse();
