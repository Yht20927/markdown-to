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
  body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; color: #1F2937; line-height: 1.6; padding: 40px; margin: 0; background: #fff; }
  h1 { font-size: 24px; } h2 { font-size: 20px; } h3 { font-size: 17px; }
  table { border-collapse: collapse; width: auto; margin: 12px 0; }
  th { background: #F6F8FA; font-weight: 600; padding: 8px 14px; border: 1px solid #D0D7DE; text-align: left; }
  td { padding: 6px 14px; border: 1px solid #D0D7DE; }
  pre { background: #F6F8FA; border: 1px solid #D0D7DE; border-radius: 6px; padding: 16px; }
  code { font-family: Consolas, monospace; font-size: 13px; }
  a { color: #0969DA; }
  .katex-display { margin: 12px 0; }
  .katex { font-size: 1.1em; }
`;

program
  .name('md-table-to-image')
  .description('Render Markdown tables as PNG/JPG image')
  .version(pkg.version);

program.command('convert')
  .description('Convert a Markdown table to image')
  .requiredOption('-i, --input <file>', 'Input Markdown file (tables only or full MD)')
  .requiredOption('-o, --output <file>', 'Output image file (.png or .jpg)')
  .option('--allow-remote', 'Allow remote images/fonts (JavaScript stays disabled)')
  .action(async (opts) => {
    const input = path.resolve(opts.input);
    const output = path.resolve(opts.output);
    if (!fs.existsSync(input)) { console.error('Input file not found'); process.exit(1); }
    const ext = path.extname(output).toLowerCase();
    if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') {
      console.error('Output must be .png or .jpg'); process.exit(1);
    }

    const md = stripFrontmatter(fs.readFileSync(input, 'utf-8'));
    const bodyHtml = renderMarkdown(md);
    const fullHtml = inlineLocalImages(buildHtmlPage({
      body: bodyHtml,
      css: pageCss,
      title: 'Markdown Table to Image',
      headExtra: buildMathHeadExtras({ dark: false }),
    }), path.dirname(input));

    try {
      await withPage(async (page) => {
        await page.setViewport({ width: 900, height: 100 });
        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
        const [bodyHeight, scrollWidth] = await page.evaluate(() => [
          document.body.scrollHeight,
          Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
        ]);
        const width = Math.max(900, Math.ceil(scrollWidth) + 40);
        await page.setViewport({ width, height: Math.ceil(bodyHeight) + 40 });
        const finalHeight = await page.evaluate(() => document.body.scrollHeight);
        if (Math.ceil(finalHeight) + 40 > Math.ceil(bodyHeight) + 40) {
          await page.setViewport({ width, height: Math.ceil(finalHeight) + 40 });
        }
        const format = ext === '.png' ? 'png' : 'jpeg';
        await page.screenshot({ path: output, fullPage: true, type: format, omitBackground: false });
      }, { allowRemote: Boolean(opts.allowRemote) });
      console.log(`Done: ${output}`);
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  });

program.parse();
