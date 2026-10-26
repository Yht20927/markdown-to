const { withPage } = require('../../shared/browser-pool');
const { stripFrontmatter } = require('../../shared/frontmatter');
const { inlineLocalImages } = require('../../shared/html-renderer');
const path = require('path');
const { pathToFileURL } = require('url');

async function htmlToPdf(
  html,
  outputPath,
  margin = { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
  { allowRemote = false, pageNumbers = true } = {}
) {
  await withPage(async (page) => {
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    const footerTemplate = pageNumbers
      ? '<div style="width:100%;padding:0 15mm;font-size:9px;color:#8B949E;text-align:right;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
      : '<span></span>';
    await page.pdf({
      path: outputPath,
      format: 'A4',
      margin,
      printBackground: true,
      displayHeaderFooter: pageNumbers,
      headerTemplate: '<span></span>',
      footerTemplate,
      preferCSSPageSize: false,
    });
  }, { allowRemote });
}

async function htmlToPreview(html, outputPath) {
  const fs = require('fs');
  fs.writeFileSync(outputPath, html, 'utf-8');
}

async function convertFile(inputPath, outputPath, templateId, { allowRemote = false, pageNumbers = true } = {}) {
  const fs = require('fs');
  const { renderHtml } = require('./renderer');

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const md = stripFrontmatter(fs.readFileSync(inputPath, 'utf-8'));
  const title = path.basename(inputPath, path.extname(inputPath));
  const baseHref = pathToFileURL(path.dirname(inputPath) + path.sep).href;
  const { html, template } = renderHtml(md, templateId, title, baseHref);

  const ext = path.extname(outputPath).toLowerCase();
  if (ext === '.html') {
    await htmlToPreview(html, outputPath);
  } else {
    const pdfHtml = inlineLocalImages(html, path.dirname(inputPath));
    // F-5: Use pageMargin from theme if available, otherwise default
    const margin = template.pageMargin || { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' };
    await htmlToPdf(pdfHtml, outputPath, margin, { allowRemote, pageNumbers });
  }

  return { template };
}

module.exports = { convertFile, htmlToPdf, htmlToPreview };
