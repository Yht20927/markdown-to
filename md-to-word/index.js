#!/usr/bin/env node
const { program } = require('commander');
const { Marked } = require('marked');
const katex = require('katex');
const hljs = require('highlight.js');
const { createRenderer } = require('../shared/html-renderer');
const { buildHtmlPage } = require('../shared/html-page');
const { stripFrontmatter } = require('../shared/frontmatter');
const { hljsCss } = require('../shared/math-assets');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { markdownToDocx } = require('./docx');

const { renderMarkdown } = createRenderer({ Marked, katex, hljs, mathMode: 'tex' });

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

// M4: Word-optimized CSS with mso namespace styles
const msoCss = `
  @page Section1 { size: 595.3pt 841.9pt; margin: 2.54cm 2.54cm 2.54cm 2.54cm; mso-header-margin: 1.5cm; mso-footer-margin: 1.25cm; mso-page-orientation: portrait; }
  div.Section1 { page: Section1; }

  body {
    font-family: 'Calibri', sans-serif;
    font-size: 11pt;
    color: #000;
    line-height: 1.5;
    margin: 0;
  }

  h1 { mso-style-name: "Heading 1"; font-size: 16pt; color: #2E74B5; mso-style-parent: ""; margin-bottom: 6pt; page-break-after: avoid; }
  h2 { mso-style-name: "Heading 2"; font-size: 14pt; color: #2E74B5; margin-bottom: 4pt; page-break-after: avoid; }
  h3 { mso-style-name: "Heading 3"; font-size: 12pt; color: #1F3864; margin-bottom: 3pt; page-break-after: avoid; }

  p { mso-style-name: "Normal"; margin-top: 0; margin-bottom: 6pt; }

  pre {
    mso-style-name: "Source Code";
    background: #F2F2F2;
    border: 1px solid #D4D4D4;
    padding: 8pt;
    font-family: Consolas, monospace;
    font-size: 9pt;
    border-radius: 4px;
  }

  code {
    font-family: Consolas, monospace;
    font-size: 9pt;
    background: #F2F2F2;
    padding: 1pt 3pt;
    border-radius: 2px;
  }
  pre code { padding: 0; background: none; }

  blockquote {
    mso-style-name: "Quote";
    border-left: 4px solid #CCC;
    padding: 4pt 12pt;
    color: #666;
    font-style: italic;
    margin: 6pt 0;
    border-radius: 0 4px 4px 0;
  }

  table {
    mso-style-name: "Table Grid";
    border-collapse: collapse;
    width: 100%;
    margin: 8pt 0;
  }
  th {
    background: #2E74B5;
    color: #fff;
    font-weight: bold;
    padding: 4pt 8pt;
    border: 1px solid #BFBFBF;
  }
  td {
    padding: 3pt 8pt;
    border: 1px solid #BFBFBF;
  }
  tr:nth-child(even) td { background: #F2F2F2; }

  img { max-width: 100%; }
  a { color: #0563C1; }
  .math { font-family: 'Cambria Math', 'Times New Roman', serif; font-style: italic; }
  .math-display { text-align: center; margin: 6pt 0; }
`;

program
  .name('md-to-word')
  .description('Convert Markdown to Word (.doc or .docx).')
  .version(pkg.version);

program.command('convert')
  .description('Convert a Markdown file to Word .doc or .docx')
  .requiredOption('-i, --input <file>', 'Input Markdown file')
  .requiredOption('-o, --output <file>', 'Output .doc or .docx file')
  .action(async (opts) => {
    const input = path.resolve(opts.input);
    const output = path.resolve(opts.output);
    if (!fs.existsSync(input)) { console.error('Input file not found'); process.exit(1); }
    if (!/\.(doc|docx)$/i.test(output)) {
      console.error('Output must be a .doc or .docx file');
      process.exit(1);
    }
    const md = stripFrontmatter(fs.readFileSync(input, 'utf-8'));
    if (/\.docx$/i.test(output)) {
      const buffer = await markdownToDocx(md, {
        baseDir: path.dirname(input),
        title: path.basename(input, path.extname(input)),
      });
      fs.writeFileSync(output, buffer);
      console.log(`Done: ${output} (${buffer.length} bytes)`);
      return;
    }
    const bodyHtml = renderMarkdown(md);
    const codeCss = `<style>${hljsCss(false)}</style>`;

    // Relative images/links resolve against the source Markdown directory.
    const baseHref = pathToFileURL(path.dirname(input) + path.sep).href;
    const baseTag = `  <base href="${baseHref.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`;

    // Word namespace XML + mso CSS
    const headExtra = `${baseTag}
${codeCss}
<!--[if gte mso 9]><xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml><![endif]-->`;

    const docHtml = buildHtmlPage({
      body: `<div class="Section1">${bodyHtml}</div>`,
      css: msoCss,
      title: '',
      headExtra,
      bodyAttrs: 'xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"',
    });

    fs.writeFileSync(output, docHtml, 'utf-8');
    console.log(`Done: ${output} (${Buffer.byteLength(docHtml)} bytes)`);
  });

program.parse();
