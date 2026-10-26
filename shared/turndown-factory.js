/**
 * Shared turndown factory for HTML→Markdown and Word→Markdown converters.
 *
 * Provides a unified turndown instance with GFM table support,
 * consistent heading/code-block styles, and optional GFM extensions.
 */

const TurndownService = require('turndown');

/**
 * Create a configured turndown instance with GFM table rule.
 *
 * @param {Object} [options]
 * @param {boolean} [options.gfmTables=true] - Enable GFM table conversion
 * @param {boolean} [options.headingStyle='atx'] - Heading style
 * @param {boolean} [options.codeBlockStyle='fenced'] - Code block style
 * @returns {TurndownService}
 */
function createTurndown({ gfmTables = true, headingStyle = 'atx', codeBlockStyle = 'fenced' } = {}) {
  const td = new TurndownService({ headingStyle, codeBlockStyle });

  td.addRule('non-content', {
    filter: ['head', 'script', 'style', 'title', 'noscript', 'template', 'meta', 'link'],
    replacement: () => ''
  });

  const cellToMarkdown = (cell) => {
    const raw = td.turndown(cell.innerHTML || '');
    return raw
      .replace(/\r\n?/g, '\n')
      .replace(/\n{2,}/g, '<br>')
      .replace(/\n/g, '<br>')
      .replace(/[ \t]+<br>/g, '<br>')
      .replace(/<br>[ \t]+/g, '<br>')
      .replace(/\|/g, '\\|')
      .trim();
  };

  if (gfmTables) {
    td.addRule('table', {
      filter: 'table',
      replacement: function (_content, node) {
        const rows = [];
        const allRows = Array.from(node.rows || []);
        if (allRows.length === 0) return '';

        const thead = node.querySelector('thead');
        const headerRow = thead ? thead.querySelector('tr') : null;
        const headerIndex = headerRow ? allRows.indexOf(headerRow) : -1;
        const firstRow = headerRow || allRows[0];
        const headerCells = Array.from(firstRow.querySelectorAll('th, td'));
        if (headerCells.length === 0) return '';

        const headers = headerCells.map(cellToMarkdown);
        rows.push('| ' + headers.join(' | ') + ' |');
        rows.push('| ' + headers.map(() => '---').join(' | ') + ' |');

        for (let i = 0; i < allRows.length; i++) {
          if (i === (headerIndex >= 0 ? headerIndex : 0)) continue;
          const cells = Array.from(allRows[i].querySelectorAll('th, td')).map(cellToMarkdown);
          while (cells.length < headers.length) cells.push('');
          if (cells.length > 0) rows.push('| ' + cells.join(' | ') + ' |');
        }

        return '\n\n' + rows.join('\n') + '\n\n';
      }
    });
  }

  return td;
}

module.exports = { createTurndown };
