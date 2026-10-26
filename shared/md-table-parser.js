/**
 * Markdown table parser — extracts and parses all GFM tables from markdown text.
 *
 * Handles:
 * - Escaped pipes (\|)
 * - Empty cells
 * - Alignment detection (:---, :---:, ---:)
 * - Multiple tables in one document
 */

/**
 * Split a table row string into cells, respecting escaped pipes.
 * Strips leading/trailing pipe delimiters.
 * @param {string} row - A single table row like '| a | b | c |'
 * @returns {string[]} Array of cell values
 */
function splitTableCells(row) {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
      current += '|'; // unescape \| → |
      i++;
    } else if (trimmed[i] === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += trimmed[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Parse alignment from a separator cell.
 * @param {string} cell - e.g. ':---', ':---:', '---:', '---'
 * @returns {'left'|'center'|'right'|null}
 */
function parseAlignment(cell) {
  const s = cell.trim();
  const left = s.startsWith(':');
  const right = s.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

/**
 * Check if a line is a GFM table separator row.
 * @param {string} line
 * @returns {boolean}
 */
function isSeparatorRow(line) {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  return splitTableCells(trimmed).every((cell) => /^:?-{1,}:?$/.test(cell));
}

/**
 * Parse all markdown tables from text.
 *
 * @param {string} md - Markdown text
 * @returns {Array<{headers: string[], aligns: Array<string|null>, rows: string[][]}>}
 */
function parseTables(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const results = [];
  let fence = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) {
        fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
      } else if (fence.char === fenceMatch[1][0] && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence) continue;
    if (/^(?: {4}|\t)/.test(line)) continue;

    if (!line.includes('|') || i + 1 >= lines.length || !isSeparatorRow(lines[i + 1])) continue;

    const headers = splitTableCells(line);
    if (headers.length === 0) continue;

    const aligns = splitTableCells(lines[i + 1]).map(parseAlignment);
    while (aligns.length < headers.length) aligns.push(null);

    const rows = [];
    i += 2;
    while (i < lines.length) {
      const rowLine = lines[i];
      if (!rowLine.trim() || !rowLine.includes('|')) break;
      if (i + 1 < lines.length && isSeparatorRow(lines[i + 1])) break;
      const cells = splitTableCells(rowLine);
      while (cells.length < headers.length) cells.push('');
      rows.push(cells.slice(0, headers.length));
      i++;
    }
    i--;

    results.push({ headers, aligns: aligns.slice(0, headers.length), rows });
  }

  return results;
}

module.exports = { parseTables, splitTableCells, parseAlignment, isSeparatorRow };
