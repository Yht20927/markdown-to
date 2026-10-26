#!/usr/bin/env node
const { program } = require('commander');
const { Marked } = require('marked');
const katex = require('katex');
const hljs = require('highlight.js');
const { createRenderer, inlineLocalImages } = require('../shared/html-renderer');
const { withPage } = require('../shared/browser-pool');
const { buildMathHeadExtras } = require('../shared/math-assets');
const { buildHtmlPage } = require('../shared/html-page');
const { stripFrontmatter } = require('../shared/frontmatter');
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

// Use createRenderer for katex/hljs support
const { renderMarkdown } = createRenderer({ Marked, katex, hljs });

const pageCss = `
  body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12pt; color: #1F2937; line-height: 1.5; margin: 0; padding: 20mm; }
  table { border-collapse: collapse; width: auto; margin: 12pt 0; }
  th { background: #2E74B5; color: #fff; font-weight: 600; padding: 6pt 12pt; border: 1px solid #CBD5E1; }
  td { padding: 4pt 12pt; border: 1px solid #CBD5E1; }
  tr:nth-child(even) td { background: #F8FAFC; }
  h1,h2,h3 { color: #1E3A5F; }
  .katex-display { margin: 12pt 0; }
  .katex { font-size: 1.1em; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

program
  .name('md-table-to-pdf')
  .description('Render Markdown tables as PDF')
  .version(pkg.version);

program.command('convert')
  .description('Convert Markdown table(s) to PDF')
  .requiredOption('-i, --input <file>', 'Input Markdown file')
  .requiredOption('-o, --output <file>', 'Output PDF file')
  .option('--allow-remote', 'Allow remote images/fonts (JavaScript stays disabled)')
  .action(async (opts) => {
    const input = path.resolve(opts.input);
    const output = path.resolve(opts.output);
    if (!fs.existsSync(input)) { console.error('Input file not found'); process.exit(1); }

    const md = stripFrontmatter(fs.readFileSync(input, 'utf-8'));
    const bodyHtml = renderMarkdown(md);
    const fullHtml = inlineLocalImages(buildHtmlPage({
      body: bodyHtml,
      css: pageCss,
      title: 'Markdown Table to PDF',
      headExtra: buildMathHeadExtras({ dark: false }),
    }), path.dirname(input));

    try {
      await withPage(async (page) => {
        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
        await page.pdf({
          path: output,
          format: 'A4',
          margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' },
          printBackground: true,
          displayHeaderFooter: false,
        });
      }, { allowRemote: Boolean(opts.allowRemote) });
      console.log(`Done: ${output}`);
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  });

program.parse();
