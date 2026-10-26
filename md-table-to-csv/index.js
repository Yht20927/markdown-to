#!/usr/bin/env node
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { resolveInOut, readInput, writeOutput, handleError } = require('../shared/cli');
const { stripFrontmatter } = require('../shared/frontmatter');
const { writeCsv, escapeCsvCell } = require('../shared/csv');
const { parseTables } = require('../shared/md-table-parser');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

function markdownTableToCSV(md) {
  const tables = parseTables(md);
  if (tables.length === 0) return '';

  const results = [];
  for (const table of tables) {
    const allRows = [table.headers, ...table.rows];
    results.push(writeCsv(allRows));
  }

  return results.join('\n\n');
}

program
  .name('md-table-to-csv')
  .description('Extract Markdown tables to CSV format')
  .version(pkg.version);

program.command('convert')
  .description('Extract tables from Markdown to CSV')
  .requiredOption('-i, --input <file>', 'Input Markdown file')
  .requiredOption('-o, --output <file>', 'Output CSV file')
  .action(async (opts) => {
    try {
      const { input, output } = resolveInOut(opts);
      const md = stripFrontmatter(readInput(input));
      const result = markdownTableToCSV(md);
      writeOutput(output, result);
    } catch (e) { handleError(e); }
  });

program.parse();
