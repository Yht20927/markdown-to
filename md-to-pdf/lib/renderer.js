const { Marked } = require('marked');
const katex = require('katex');
const hljs = require('highlight.js');
const { createRenderer } = require('../../shared/html-renderer');
const { buildMathHeadExtras, isDarkTemplate } = require('../../shared/math-assets');
const { getTemplate } = require('./templates');

const { escapeHtml, renderMarkdown } = createRenderer({ Marked, katex, hljs });

function safeColor(value) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value || '') ? value : '#ffffff';
}

function buildCss(template) {
  const { colors, fonts, fontSizes, spacing } = template;

  return `
    :root {
      --t-heading: ${colors.heading};
      --t-text: ${colors.text};
      --t-link: ${colors.link};
      --t-code-bg: ${colors.codeBackground};
      --t-code-border: ${colors.codeBorder};
      --t-code-text: ${colors.codeText};
      --t-quote-text: ${colors.quoteText};
      --t-quote-border: ${colors.quoteBorder};
      --t-quote-bg: ${colors.quoteBackground};
      --t-table-header-bg: ${colors.tableHeaderBg};
      --t-table-header-text: ${colors.tableHeaderText};
      --t-table-border: ${colors.tableBorder};
      --t-table-row-odd: ${colors.tableRowOdd};
      --t-table-row-even: ${colors.tableRowEven};
      --t-font-heading: "${fonts.heading}", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --t-font-body: "${fonts.body}", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --t-font-code: "${fonts.code}", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      --t-h1: ${fontSizes.h1}pt;
      --t-h2: ${fontSizes.h2}pt;
      --t-h3: ${fontSizes.h3}pt;
      --t-h4: ${fontSizes.h4}pt;
      --t-h5: ${fontSizes.h5}pt;
      --t-h6: ${fontSizes.h6}pt;
      --t-body: ${fontSizes.body}pt;
      --t-code-size: ${fontSizes.code}pt;
      --t-heading-before: ${spacing.headingBefore}pt;
      --t-heading-after: ${spacing.headingAfter}pt;
      --t-para-before: ${spacing.paragraphBefore}pt;
      --t-para-after: ${spacing.paragraphAfter}pt;
      --t-line-height: ${spacing.lineHeight};
      --t-bg: ${safeColor(colors.background)};
    }

    html, body {
      background: var(--t-bg);
    }

    body {
      background: var(--t-bg);
      font-family: var(--t-font-body);
      font-size: var(--t-body);
      color: var(--t-text);
      line-height: var(--t-line-height);
      margin: 0;
      padding: 0;
    }

    .content {
      max-width: 100%;
      padding: 0;
    }

    h1 { font-family: var(--t-font-heading); font-size: var(--t-h1); color: var(--t-heading); margin-top: var(--t-heading-before); margin-bottom: var(--t-heading-after); page-break-after: avoid; }
    h2 { font-family: var(--t-font-heading); font-size: var(--t-h2); color: var(--t-heading); margin-top: var(--t-heading-before); margin-bottom: var(--t-heading-after); page-break-after: avoid; }
    h3 { font-family: var(--t-font-heading); font-size: var(--t-h3); color: var(--t-heading); margin-top: var(--t-heading-before); margin-bottom: var(--t-heading-after); page-break-after: avoid; }
    h4 { font-family: var(--t-font-heading); font-size: var(--t-h4); color: var(--t-heading); margin-top: var(--t-heading-before); margin-bottom: var(--t-heading-after); page-break-after: avoid; }
    h5 { font-family: var(--t-font-heading); font-size: var(--t-h5); color: var(--t-heading); margin-top: var(--t-heading-before); margin-bottom: var(--t-heading-after); page-break-after: avoid; }
    h6 { font-family: var(--t-font-heading); font-size: var(--t-h6); color: var(--t-heading); margin-top: var(--t-heading-before); margin-bottom: var(--t-heading-after); page-break-after: avoid; }

    p { margin-top: var(--t-para-before); margin-bottom: var(--t-para-after); }

    a { color: var(--t-link); }

    pre {
      background: var(--t-code-bg);
      border: 1px solid var(--t-code-border);
      border-radius: 4px;
      padding: 10px 12px;
      overflow-x: auto;
      font-family: var(--t-font-code);
      font-size: var(--t-code-size);
      page-break-inside: avoid;
    }

    pre code {
      color: var(--t-code-text);
      font-family: var(--t-font-code);
      font-size: var(--t-code-size);
    }

    code {
      font-family: var(--t-font-code);
      font-size: var(--t-code-size);
      background: var(--t-code-bg);
      padding: 1px 4px;
      border-radius: 3px;
    }

    pre code {
      padding: 0;
      background: none;
    }

    blockquote {
      color: var(--t-quote-text);
      background: var(--t-quote-bg);
      border-left: 4px solid var(--t-quote-border);
      padding: 8px 16px;
      margin: 8px 0;
      font-style: italic;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
    }

    thead { display: table-header-group; }

    th {
      background: var(--t-table-header-bg);
      color: var(--t-table-header-text);
      font-weight: 600;
      padding: 8px 12px;
      border: 1px solid var(--t-table-border);
      text-align: left;
    }

    td {
      padding: 6px 12px;
      border: 1px solid var(--t-table-border);
    }

    tr:nth-child(odd) td { background: var(--t-table-row-odd); }
    tr:nth-child(even) td { background: var(--t-table-row-even); }

    img { max-width: 100%; height: auto; }

    ul, ol { margin-top: var(--t-para-before); margin-bottom: var(--t-para-after); padding-left: 1.5em; }
    li { margin-bottom: 2pt; }

    hr { border: none; border-top: 1px solid var(--t-table-border); margin: 16px 0; }

    .katex-display { margin: 12px 0; page-break-inside: avoid; }
    .katex { font-size: 1.1em; }

    /* === M4 Beautification === */

    /* Code blocks: rounded corners, shadow, language tag */
    pre {
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,.08);
      position: relative;
    }
    pre[data-lang]::before {
      content: attr(data-lang);
      position: absolute;
      top: 0;
      right: 0;
      font-size: .75em;
      color: var(--t-muted, #888);
      padding: 2px 8px;
      background: var(--t-code-bg);
      border-radius: 0 6px 0 4px;
      font-family: var(--t-font-code);
    }

    /* Table: rounded corners, sticky header */
    table {
      border-radius: 6px;
      overflow: hidden;
    }
    thead {
      display: table-header-group;
    }
    tr { page-break-inside: avoid; }

    /* Blockquote: colored left border, light bg */
    blockquote {
      border-left: 4px solid var(--t-accent, var(--t-quote-border));
      background: var(--t-quote-bg);
      padding: .5em 1em;
      font-style: italic;
      border-radius: 0 4px 4px 0;
    }

    /* Admonition blocks */
    .admonition {
      border-left: 4px solid;
      padding: .8em 1em;
      border-radius: 4px;
      margin: 1em 0;
    }
    .admonition.warn { border-color: #d97706; background: #fef3c7; }
    .admonition.info { border-color: #2563eb; background: #dbeafe; }
    .admonition.tip { border-color: #16a34a; background: #dcfce7; }
    .admonition.danger { border-color: #dc2626; background: #fee2e2; }

    /* Cover page */
    .cover {
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: 100vh;
      text-align: center;
      page-break-after: always;
    }
    .cover h1 { font-size: 2.4em; margin-bottom: .2em; }
    .cover .meta { color: var(--t-muted, #888); font-size: .9em; }

    /* TOC */
    .toc { page-break-after: always; }
    .toc h2 { font-size: 1.6em; }
    .toc ul { list-style: none; padding-left: 0; }
    .toc li { margin-bottom: 4pt; }
    .toc a { color: var(--t-link); text-decoration: none; }

    /* Page background / numbers via @page */
    @page {
      background: ${safeColor(colors.background)};
      @bottom-right {
        content: counter(page);
        font-size: 9pt;
        color: var(--t-muted, #888);
      }
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;
}

function renderHtml(md, templateId, title = 'Markdown to PDF', baseHref = '') {
  const template = getTemplate(templateId);

  // A7: Use shared renderMarkdown instead of duplicating marked/math/code logic
  const bodyHtml = renderMarkdown(md);

  const css = buildCss(template);
  const headExtras = buildMathHeadExtras({ dark: isDarkTemplate(template) });
  const baseTag = baseHref ? `  <base href="${escapeHtml(baseHref)}">\n` : '';

  const fullPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
${baseTag}  ${headExtras}
  <style>${css}</style>
</head>
<body>
  <div class="content">
    ${bodyHtml}
  </div>
</body>
</html>`;

  return { html: fullPage, template };
}

module.exports = { renderHtml };
