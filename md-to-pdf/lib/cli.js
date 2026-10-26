const { program } = require('commander');
const { listTemplates, getTemplate, listAllTemplateIds, getCategories } = require('./templates');
const { convertFile } = require('./converter');
const path = require('path');
const fs = require('fs');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));

program
  .name('md-to-pdf')
  .description('Convert Markdown to PDF with 29 professional templates')
  .version(pkg.version);

program
  .command('list')
  .description('List all available themes')
  .option('-c, --category <cat>', 'Filter by category')
  .action((opts) => {
    const templates = listTemplates();
    const categories = getCategories();
    const categoryNames = {
      business: 'Business',
      tech: 'Tech / Developer',
      minimal: 'Minimal / Clean',
      academic: 'Academic / Paper',
      creative: 'Creative',
    };

    console.log('\nAvailable themes (29 total with spacing variants):\n');

    for (const cat of categories) {
      const catTemplates = templates.filter((t) => t.category === cat);
      if (opts.category && cat !== opts.category) continue;

      console.log(`  ${categoryNames[cat] || cat}:`);
      for (const t of catTemplates) {
        const variantNote = t.hasVariants ? ' (+ compact, relaxed)' : '';
        console.log(`    - ${t.id}  "${t.name}"${variantNote}`);
      }
      console.log();
    }

    console.log('Spacing variants: use suffix -standard, -compact, or -relaxed\n');
  });

program
  .command('convert')
  .description('Convert a Markdown file to PDF')
  .requiredOption('-i, --input <file>', 'Input Markdown file')
  .requiredOption('-o, --output <file>', 'Output file (.pdf or .html for preview)')
  .option('-t, --theme <name>', 'Theme ID (default: github-dark-sans-modern-standard)', 'github-dark-sans-modern-standard')
  .option('--allow-remote', 'Allow remote images/fonts (JavaScript stays disabled)')
  .action(async (opts) => {
    const inputPath = path.resolve(opts.input);
    const outputPath = path.resolve(opts.output);

    console.log(`Input:    ${inputPath}`);
    console.log(`Output:   ${outputPath}`);
    console.log(`Theme:    ${opts.theme}`);

    try {
      const startTime = Date.now();
      const { template } = await convertFile(inputPath, outputPath, opts.theme, {
        allowRemote: Boolean(opts.allowRemote),
      });
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`Template: ${template.name.en} (${template.fonts.heading} / ${template.fonts.body})`);
      console.log(`Done in ${elapsed}s`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show detailed info about a theme')
  .argument('<theme-id>', 'Theme ID')
  .action((themeId) => {
    try {
      const template = getTemplate(themeId);
      console.log(`\nTheme: ${template.name.en} (${template.name['zh-cn']})`);
      console.log(`Category: ${template.category}`);
      console.log(`\nColors:`);
      for (const [k, v] of Object.entries(template.colors)) {
        console.log(`  ${k}: ${v}`);
      }
      console.log(`\nFonts:`);
      for (const [k, v] of Object.entries(template.fonts)) {
        console.log(`  ${k}: ${v}`);
      }
      console.log(`\nFont Sizes (pt):`);
      for (const [k, v] of Object.entries(template.fontSizes)) {
        console.log(`  ${k}: ${v}`);
      }
      console.log(`\nSpacing (pt):`);
      for (const [k, v] of Object.entries(template.spacing)) {
        console.log(`  ${k}: ${v}`);
      }
      console.log();
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

module.exports = { program };
