#!/usr/bin/env node
const { program } = require('commander');
const mammoth = require('mammoth');
const { createTurndown } = require('../shared/turndown-factory');
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

// Use shared turndown factory with GFM table support
const turndown = createTurndown();

// Map common Word character/paragraph styles back to semantic HTML so that
// code styles emitted by md-to-word and typical Word documents survive.
const styleMap = [
  "r[style-name='Code Char'] => code",
  "r[style-name='Code'] => code",
  "r[style-name='Verbatim Char'] => code",
  "r[style-name='HTML Code'] => code",
  "p[style-name='Code Block'] => pre:fresh",
  "p[style-name='Source Code'] => pre:fresh",
  "p[style-name='HTML Preformatted'] => pre:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Quote Code'] => blockquote > pre:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='Table Align Left'] => p.table-align-left",
  "p[style-name='Table Align Center'] => p.table-align-center",
  "p[style-name='Table Align Right'] => p.table-align-right",
];

function restoreTaskCheckboxes(html) {
  return html
    .replace(/(<li\b[^>]*>)(\s*(?:<p\b[^>]*>)?)\s*([☑☒✓✔])(?:&nbsp;|\s)*/g, '$1$2<input type="checkbox" checked disabled> ')
    .replace(/(<li\b[^>]*>)(\s*(?:<p\b[^>]*>)?)\s*([☐✗✘])(?:&nbsp;|\s)*/g, '$1$2<input type="checkbox" disabled> ');
}

program
  .name('word-to-md')
  .description('Convert Word (.docx) to Markdown')
  .version(pkg.version);

program.command('convert')
  .description('Convert a .docx file to Markdown')
  .requiredOption('-i, --input <file>', 'Input .docx file')
  .requiredOption('-o, --output <file>', 'Output Markdown file')
  .option('--assets <dir>', 'Directory for extracted images (default: <output>.assets)')
  .action(async (opts) => {
    const input = path.resolve(opts.input);
    const output = path.resolve(opts.output);
    if (!fs.existsSync(input)) { console.error('Input file not found'); process.exit(1); }
    if (!input.toLowerCase().endsWith('.docx')) { console.error('Input must be a .docx file'); process.exit(1); }
    try {
      const buf = fs.readFileSync(input);
      const assetsDir = path.resolve(
        opts.assets || path.join(path.dirname(output), path.basename(output, path.extname(output)) + '.assets')
      );
      const extByType = {
        'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
        'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/tiff': 'tiff',
        'image/x-emf': 'emf', 'image/x-wmf': 'wmf'
      };
      let imageIndex = 0;
      const result = await mammoth.convertToHtml({ buffer: buf }, {
        styleMap,
        convertImage: mammoth.images.imgElement(async (image) => {
          const base64 = await image.read('base64');
          if (!base64) return { src: '' };
          const ext = extByType[image.contentType] || 'bin';
          const filename = `image-${++imageIndex}.${ext}`;
          fs.mkdirSync(assetsDir, { recursive: true });
          fs.writeFileSync(path.join(assetsDir, filename), Buffer.from(base64, 'base64'));
          const src = path.relative(path.dirname(output), path.join(assetsDir, filename)).split(path.sep).join('/');
          return { src };
        })
      });
      const md = turndown.turndown(restoreTaskCheckboxes(result.value));
      fs.writeFileSync(output, md.endsWith('\n') ? md : md + '\n', 'utf-8');
      console.log(`Done: ${output} (${md.length} chars)`);
      if (result.messages.length > 0) console.log('Messages:', result.messages.map(m => m.message).join('; '));
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  });

program.parse();
