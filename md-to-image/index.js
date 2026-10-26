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

const { renderMarkdown } = createRenderer({ Marked, katex, hljs });

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

function buildCss({ padding, bg }) {
  return `
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 14px; color: #1F2937; line-height: 1.6;
      padding: ${padding}px; margin: 0; box-sizing: border-box;
      width: 100%; max-width: 100%; background: ${bg};
    }
    h1 { font-size: 28px; color: #111; margin-top: 24px; margin-bottom: 12px; }
    h2 { font-size: 22px; color: #222; margin-top: 20px; margin-bottom: 10px; }
    pre { background: #F6F8FA; border: 1px solid #D0D7DE; border-radius: 6px; padding: 16px; overflow-x: auto; font-size: 13px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    code { font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size: 13px; }
    blockquote { border-left: 4px solid #D0D7DE; padding: 8px 16px; color: #656D76; margin: 12px 0; border-radius: 0 4px 4px 0; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; border-radius: 6px; overflow: hidden; }
    th { background: #F6F8FA; font-weight: 600; padding: 8px 12px; border: 1px solid #D0D7DE; }
    td { padding: 8px 12px; border: 1px solid #D0D7DE; }
    tr:nth-child(even) td { background: #F8FAFC; }
    img { max-width: 100%; }
    a { color: #0969DA; }
    .watermark { position: fixed; bottom: 20px; right: 20px; font-size: 12px; color: rgba(0,0,0,.15); pointer-events: none; z-index: 999; }
    .katex-display { margin: 12px 0; }
    .katex { font-size: 1.1em; }
  `;
}

program
  .name('md-to-image')
  .description('Convert Markdown to PNG/JPEG image')
  .version(pkg.version);

program.command('convert')
  .description('Convert a Markdown file to image')
  .requiredOption('-i, --input <file>', 'Input Markdown file')
  .requiredOption('-o, --output <file>', 'Output image file (.png or .jpg)')
  .option('-w, --width <px>', 'Image width in pixels', '800')
  .option('--scale <n>', 'Device scale factor for high DPI (retina)', '1')
  .option('--padding <px>', 'Page padding in pixels', '48')
  .option('--bg <color>', 'Background color (CSS value)', '#ffffff')
  .option('--watermark <text>', 'Watermark text in bottom-right corner')
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
    const watermarkHtml = opts.watermark
      ? `<div class="watermark">${opts.watermark.replace(/</g, '&lt;')}</div>`
      : '';
    const css = buildCss({ padding: parseInt(opts.padding), bg: opts.bg });
    const fullHtml = inlineLocalImages(buildHtmlPage({
      body: bodyHtml + watermarkHtml,
      css,
      title: 'Markdown to Image',
      headExtra: buildMathHeadExtras({ dark: false }),
    }), path.dirname(input));

    try {
      const scale = Math.max(0.1, parseFloat(opts.scale) || 1);
      const width = Math.max(1, parseInt(opts.width, 10) || 800);
      await withPage(async (page) => {
        await page.setViewport({
          width,
          height: 100,
          deviceScaleFactor: scale,
        });
        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

        const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
        await page.setViewport({
          width,
          height: Math.ceil(bodyHeight) + 50,
          deviceScaleFactor: scale,
        });

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
