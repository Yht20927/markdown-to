const pdfParse = require('pdf-parse');

const MONO = /mono|courier|consolas|menlo|monaco|code/i;
const BULLET = /^[•●○◦▪■‣·]\s*/;

function normalizeText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function itemFamily(item, styles) {
  return (styles && styles[item.fontName] && styles[item.fontName].fontFamily) || '';
}

function prepareItems(items, styles) {
  return (items || [])
    .filter((item) => item && String(item.str || '').length > 0)
    .map((item) => ({
      str: String(item.str),
      x: Number(item.transform && item.transform[4]) || 0,
      y: Number(item.transform && item.transform[5]) || 0,
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      fontName: item.fontName,
      family: itemFamily(item, styles),
    }));
}

function groupLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const item of sorted) {
    let line = lines[lines.length - 1];
    if (!line || Math.abs(line.y - item.y) > Math.max(1.2, item.height * 0.22)) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
    line.y = line.items.reduce((sum, entry) => sum + entry.y, 0) / line.items.length;
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.left = line.items[0].x;
    line.height = Math.max(...line.items.map((item) => item.height));
    line.text = joinText(line.items);
    const monoChars = line.items.filter((item) => MONO.test(item.family)).reduce((sum, item) => sum + item.str.length, 0);
    const allChars = line.items.reduce((sum, item) => sum + item.str.length, 0);
    const asciiChars = line.items.reduce((sum, item) => sum + (item.str.match(/[\x00-\x7F]/g) || []).length, 0);
    line.monospace = allChars > 0 && monoChars / allChars >= 0.6 && asciiChars / allChars >= 0.5;
  }
  return lines.sort((a, b) => b.y - a.y);
}

function joinText(items) {
  let out = '';
  let previous = null;
  for (const item of items) {
    let text = item.str;
    if (!text) continue;
    if (/^\s+$/.test(text)) {
      if (out && !/\s$/.test(out)) out += ' ';
      previous = item;
      continue;
    }
    if (previous && out && !/\s$/.test(out) && !/^\s/.test(text) && !/^[,.;:!?%)\]}]/.test(text)) {
      const gap = item.x - (previous.x + previous.width);
      const cjk = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/;
      if (gap > 0.6 && !cjk.test(out.slice(-1)) && !cjk.test(text[0])) out += ' ';
    }
    out += text;
    previous = item;
  }
  return normalizeText(out);
}

function joinCode(items) {
  return items.map((item) => item.str).join('').replace(/\u00a0/g, ' ').replace(/[ \t]+$/g, '');
}

function inferBodySize(lines) {
  const counts = new Map();
  for (const line of lines) {
    if (line.monospace || line.text.length < 2) continue;
    const size = Math.round(line.height * 2) / 2;
    counts.set(size, (counts.get(size) || 0) + line.text.length);
  }
  let body = 0;
  let best = 0;
  for (const [size, count] of counts) {
    if (count > best) { best = count; body = size; }
  }
  return body || 10;
}

function headingLevels(lines, bodySize) {
  const sizes = [...new Set(lines
    .filter((line) => !line.monospace && line.height >= bodySize * 1.05)
    .map((line) => Math.round(line.height * 10) / 10))]
    .sort((a, b) => b - a);
  return (size) => {
    const rounded = Math.round(size * 10) / 10;
    const index = sizes.findIndex((candidate) => Math.abs(candidate - rounded) < 0.2);
    return index >= 0 ? Math.min(index + 1, 3) : 0;
  };
}

function splitSegments(line, bodySize) {
  const segments = [];
  let current = [];
  let previousEnd = 0;
  for (const item of line.items) {
    if (current.length && item.x - previousEnd > bodySize * 2.5) {
      segments.push(current);
      current = [];
    }
    current.push(item);
    previousEnd = item.x + item.width;
  }
  if (current.length) segments.push(current);
  return segments;
}


function tableGroups(lines, bodySize) {
  const groups = [];
  const rowSegments = lines.map((line) => {
    if (line.monospace || line.text.length > 240) return [];
    const segments = splitSegments(line, bodySize);
    if (segments.length < 2 || segments.some((segment) => joinText(segment).length > 160)) return [];
    return segments.some((segment) => joinText(segment).length <= 12) ? segments : [];
  });
  let index = 0;
  while (index < lines.length) {
    const segments = rowSegments[index];
    if (segments.length < 2 || lines[index].monospace) { index++; continue; }
    const group = [{ index, segments }];
    let next = index + 1;
    while (next < lines.length && rowSegments[next].length === segments.length) {
      group.push({ index: next, segments: rowSegments[next] });
      next++;
    }
    if (group.length >= 2) {
      groups.push({ start: index, end: next - 1, rows: group });
      index = next;
    } else {
      index++;
    }
  }
  return groups;
}

function escapeCell(value) {
  return normalizeText(value).replace(/\|/g, '\\|');
}

function renderTable(group) {
  const rows = group.rows.map((row) => row.segments.map((segment) => escapeCell(joinText(segment))));
  const columns = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => {
    const cells = row.slice();
    while (cells.length < columns) cells.push('');
    return cells;
  });
  const header = normalized[0];
  const body = normalized.slice(1);
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ];
  return lines.join('\n');
}

function cleanPageNumber(line, bodySize) {
  if (line.height >= bodySize * 0.85) return false;
  if (line.y > 80) return false;
  return /^\d+(?:\s*\/\s*\d+)?$/.test(line.text);
}

function pageToBlocks(lines, bodySize) {
  const levels = headingLevels(lines, bodySize);
  const filtered = lines.filter((line) => !cleanPageNumber(line, bodySize));
  const groups = tableGroups(filtered, bodySize);
  const tableStart = new Map(groups.map((group) => [group.start, group]));
  const tableRows = new Set();
  for (const group of groups) {
    for (let i = group.start; i <= group.end; i++) tableRows.add(i);
  }

  const languageLines = new Set();
  const languages = new Map();
  for (let i = 0; i < filtered.length - 1; i++) {
    const line = filtered[i];
    if (line.height < bodySize * 0.75 && line.text.length <= 16 && /^[a-z0-9_+#.-]+$/i.test(line.text) && filtered[i + 1].monospace) {
      languageLines.add(i);
      languages.set(i + 1, line.text);
    }
  }

  const leftMargin = Math.min(...filtered.filter((line) => !line.monospace).map((line) => line.left));
  const blocks = [];
  let paragraph = [];
  let list = [];
  let listKind = '';
  let previousParagraphLine = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push(paragraph.join(' '));
    paragraph = [];
    previousParagraphLine = null;
  };
  const flushList = () => {
    if (list.length) blocks.push(list.join('\n'));
    list = [];
    listKind = '';
  };
  const flush = () => { flushParagraph(); flushList(); };

  for (let i = 0; i < filtered.length; i++) {
    const line = filtered[i];
    if (languageLines.has(i)) continue;

    const table = tableStart.get(i);
    if (table) {
      flush();
      blocks.push(renderTable(table));
      i = table.end;
      continue;
    }
    if (tableRows.has(i)) continue;

    if (line.monospace) {
      flush();
      const language = languages.get(i) || '';
      const code = [];
      let j = i;
      while (j < filtered.length && filtered[j].monospace) {
        code.push(joinCode(filtered[j].items));
        j++;
      }
      blocks.push(`\`\`\`${language}\n${code.join('\n')}\n\`\`\``);
      i = j - 1;
      continue;
    }

    const bullet = line.text.match(BULLET);
    const ordered = line.text.match(/^(\d+[.)])\s+(.+)$/);
    const level = levels(line.height);
    if (level && !bullet) {
      flush();
      blocks.push(`${'#'.repeat(level)} ${line.text}`);
      continue;
    }

    const previousLine = filtered[i - 1];
    const indented = line.left > leftMargin + bodySize * 0.8
      && (!previousLine || previousLine.y - line.y > bodySize * 1.6);
    if (bullet || ordered || indented) {
      flushParagraph();
      const kind = ordered ? 'ordered' : 'bullet';
      if (listKind && listKind !== kind) flushList();
      listKind = kind;
      if (bullet) list.push(`- ${line.text.replace(BULLET, '').trim()}`);
      else if (ordered) list.push(`${ordered[1]} ${ordered[2].trim()}`);
      else list.push(`- ${line.text.trim()}`);
      previousParagraphLine = null;
      continue;
    }

    if (previousParagraphLine && previousParagraphLine.y - line.y > bodySize * 1.9) {
      flushParagraph();
    }
    flushList();
    paragraph.push(line.text);
    previousParagraphLine = line;
  }
  flush();
  return blocks;
}

function layoutToMarkdown(pages) {
  const output = [];
  for (const page of pages || []) {
    const items = prepareItems(page.items, page.styles);
    if (!items.length) continue;
    const lines = groupLines(items);
    const bodySize = inferBodySize(lines);
    output.push(...pageToBlocks(lines, bodySize));
  }
  return output.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function cleanExtractedText(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*\d+(?:\s*\/\s*\d+)?\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdf(buffer) {
  const pages = [];
  let data;
  try {
    data = await pdfParse(buffer, {
      pagerender: async (pageData) => {
        const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
        pages.push({ items: content.items, styles: content.styles });
        return content.items.map((item) => item.str).join(' ');
      },
    });
  } catch {
    data = null;
  }

  if (!data || !pages.length) {
    data = await pdfParse(buffer);
    return { markdown: cleanExtractedText(data.text), numpages: data.numpages };
  }

  const structured = layoutToMarkdown(pages);
  const raw = cleanExtractedText(data.text);
  const compact = (value) => value.replace(/\s/g, '').length;
  return {
    markdown: structured && compact(structured) >= compact(raw) * 0.5 ? structured : raw,
    numpages: data.numpages,
  };
}

module.exports = { layoutToMarkdown, extractPdf, cleanExtractedText };
