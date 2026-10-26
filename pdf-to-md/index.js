#!/usr/bin/env node
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { resolveInOut, handleError } = require('../shared/cli');
const { extractPdf } = require('./layout');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

program
  .name('pdf-to-md')
  .description('Extract text from PDF to Markdown')
  .version(pkg.version);

program.command('convert')
  .description('Convert a PDF file to Markdown')
  .requiredOption('-i, --input <file>', 'Input PDF file')
  .requiredOption('-o, --output <file>', 'Output Markdown file')
  .option('--allow-empty', 'Allow empty output (e.g. for scanned/image PDFs)')
  .action(async (opts) => {
    try {
      const { input, output } = resolveInOut(opts);
      if (!fs.existsSync(input)) { console.error('Input file not found'); process.exit(1); }
      if (!input.toLowerCase().endsWith('.pdf')) { console.error('Input must be a .pdf file'); process.exit(1); }

      const buf = fs.readFileSync(input);
      const result = await extractPdf(buf);
      const text = result.markdown || '';

      // P0-21: Exit with code 1 for empty text, unless --allow-empty
      if (!text.trim()) {
        if (opts.allowEmpty) {
          console.log('No text could be extracted from this PDF (--allow-empty enabled)');
        } else {
          console.error('No text could be extracted from this PDF (possibly scanned/image PDF). Use --allow-empty to suppress this error.');
          process.exit(1);
        }
      }
      fs.writeFileSync(output, text.endsWith('\n') ? text : text + '\n', 'utf-8');
      console.log(`Done: ${output} (${text.length} chars, ${result.numpages} pages)`);
    } catch (e) { handleError(e); }
  });

program.parse();
