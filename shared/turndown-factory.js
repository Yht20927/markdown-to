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

  td.addRule('preWithoutCode', {
    filter: (node) => node.nodeName === 'PRE' && !node.querySelector('code'),
    replacement: (_content, node) => {
      const code = textWithBreaks(node).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
      if (!code) return '';
      const className = node.getAttribute('class') || '';
      const language = className.match(/(?:^|\s)language-([\w-]+)/);
      const longestRun = (code.match(/`{3,}/g) || []).reduce((max, run) => Math.max(max, run.length), 2);
      const fence = '`'.repeat(longestRun + 1);
      return `\n\n${fence}${language ? language[1] : ''}\n${code}\n${fence}\n\n`;
    }
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

  const rowCells = (row) => {
    const cells = row.cells ? Array.from(row.cells) : Array.from(row.querySelectorAll('th, td'));
    return cells.filter((cell) => cell.parentNode === row);
  };

  const textWithBreaks = (node) => {
    let text = '';
    const visit = (current) => {
      if (current.nodeType === 3) {
        text += current.nodeValue || '';
        return;
      }
      if (current.nodeName === 'BR') {
        text += '\n';
        return;
      }
      Array.from(current.childNodes || []).forEach(visit);
    };
    visit(node);
    return text;
  };

  const cellAlignment = (cell) => {
    let align = (cell.getAttribute('align') || '').toLowerCase();
    if (!align) {
      const style = cell.getAttribute('style') || '';
      const match = style.match(/text-align\s*:\s*(left|center|right)/i);
      align = match ? match[1].toLowerCase() : '';
    }
    if (align === 'center') return ':---:';
    if (align === 'right') return '---:';
    if (align === 'left') return ':---';
    return '---';
  };

  td.addRule('katex', {
    filter: (node) => {
      if (node.nodeName !== 'SPAN') return false;
      const className = node.getAttribute('class') || '';
      return className.split(/\s+/).includes('katex');
    },
    replacement: (_content, node) => {
      const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
      const tex = annotation ? annotation.textContent.trim() : '';
      if (!tex) return '';
      let parent = node.parentNode;
      let display = false;
      while (parent) {
        const className = parent.getAttribute ? parent.getAttribute('class') || '' : '';
        if (className.split(/\s+/).includes('katex-display')) {
          display = true;
          break;
        }
        parent = parent.parentNode;
      }
      return display ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
    }
  });

  td.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: (content) => `~~${content}~~`
  });

  td.addRule('taskCheckbox', {
    filter: (node) => node.nodeName === 'INPUT'
      && (node.getAttribute('type') || '').toLowerCase() === 'checkbox',
    replacement: (_content, node) => {
      const checked = node.checked || node.hasAttribute('checked');
      const next = node.nextSibling ? node.nextSibling.textContent || '' : '';
      const suffix = /^\s/.test(next) ? '' : ' ';
      return `${checked ? '[x]' : '[ ]'}${suffix}`;
    }
  });

  if (gfmTables) {
    td.addRule('table', {
      filter: 'table',
      replacement: function (_content, node) {
        const rows = [];
        const allRows = Array.from(node.rows || []);
        if (allRows.length === 0) return '';

        const thead = node.querySelector('thead');
        const headerRow = thead ? (thead.rows ? thead.rows[0] : thead.querySelector('tr')) : null;
        const headerIndex = headerRow ? allRows.indexOf(headerRow) : -1;
        const firstRow = headerRow || allRows[0];
        const headerCells = rowCells(firstRow);
        if (headerCells.length === 0) return '';

        const headers = headerCells.map(cellToMarkdown);
        rows.push('| ' + headers.join(' | ') + ' |');
        rows.push('| ' + headerCells.map(cellAlignment).join(' | ') + ' |');

        for (let i = 0; i < allRows.length; i++) {
          if (i === (headerIndex >= 0 ? headerIndex : 0)) continue;
          const cells = rowCells(allRows[i]).map(cellToMarkdown);
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
