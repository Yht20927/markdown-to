#!/usr/bin/env node
const { program } = require('commander');
const { createTurndown } = require('../shared/turndown-factory');
const { resolveInOut, readInput, writeOutput, handleError } = require('../shared/cli');
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

// Use shared turndown factory with GFM table support
const turndown = createTurndown();

program
  .name('html-to-md')
  .description('Convert HTML to Markdown (powered by turndown)')
  .version(pkg.version);

program.command('convert')
  .description('Convert an HTML file to Markdown')
  .requiredOption('-i, --input <file>', 'Input HTML file')
  .requiredOption('-o, --output <file>', 'Output Markdown file')
  .action(async (opts) => {
    try {
      const { input, output } = resolveInOut(opts);
      const html = readInput(input).replace(/^\uFEFF/, '');
      const md = turndown.turndown(html).trim();
      writeOutput(output, md ? md + '\n' : '\n');
    } catch (e) { handleError(e); }
  });

program.parse();
