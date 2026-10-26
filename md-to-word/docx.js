const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const { Marked } = require('marked');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun,
  ExternalHyperlink,
  BorderStyle,
  AlignmentType,
  LevelFormat,
} = require('docx');

const mathExtensions = [
  {
    name: 'mathBlock',
    level: 'block',
    start(src) {
      const match = /(?:^|\n)[ \t]*\$\$/.exec(src);
      return match ? match.index + match[0].indexOf('$$') : undefined;
    },
    tokenizer(src) {
      const match = /^\$\$(?:[ \t]*\n)?((?:(?!\$\$)[\s\S])*?)[ \t]*\$\$[ \t]*(?:\n+|$)/.exec(src);
      return match ? { type: 'mathBlock', raw: match[0], text: match[1].trim() } : undefined;
    },
  },
  {
    name: 'mathInline',
    level: 'inline',
    start(src) {
      const index = src.indexOf('$');
      return index < 0 ? undefined : index;
    },
    tokenizer(src) {
      const match = /^\$(?![\s$])([^\n$]*?)(?<![\s\\])\$(?!\$)/.exec(src);
      return match ? { type: 'mathInline', raw: match[0], text: match[1] } : undefined;
    },
  },
];

const marked = new Marked({ gfm: true, breaks: true, extensions: mathExtensions });

const listLevels = (format, text) => Array.from({ length: 5 }, (_, level) => ({
  level,
  format,
  text: level === 0 ? text : format === LevelFormat.BULLET ? (level === 1 ? '◦' : '▪') : `%${level + 1}.`,
  alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
}));

const numbering = {
  config: [
    { reference: 'md-bullets', levels: listLevels(LevelFormat.BULLET, '•') },
    { reference: 'md-numbers', levels: listLevels(LevelFormat.DECIMAL, '%1.') },
  ],
};

const quoteListStyles = ['Bullet', 'Number'].flatMap((kind) => Array.from({ length: 5 }, (_, index) => ({
  id: `Quote${kind}${index + 1}`,
  name: `Quote ${kind} ${index + 1}`,
  basedOn: 'Normal',
  paragraph: { indent: { left: 720 + index * 720 } },
})));

const quoteHeadingStyles = Array.from({ length: 6 }, (_, index) => ({
  id: `QuoteHeading${index + 1}`,
  name: `Quote Heading ${index + 1}`,
  basedOn: `Heading${index + 1}`,
  paragraph: {
    indent: { left: 720 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC', space: 12 },
    },
  },
}));

function headingLevel(depth) {
  return [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ][Math.min(Math.max(depth || 1, 1), 6) - 1];
}

function imageType(ext, mime) {
  const value = (mime || '').toLowerCase();
  if (value.includes('png')) return 'png';
  if (value.includes('jpeg') || value.includes('jpg')) return 'jpg';
  if (value.includes('gif')) return 'gif';
  if (value.includes('bmp')) return 'bmp';
  const normalized = (ext || '').toLowerCase().replace(/^\./, '');
  if (normalized === 'jpeg') return 'jpg';
  return ['png', 'jpg', 'gif', 'bmp'].includes(normalized) ? normalized : '';
}

function imageDimensions(buffer, type) {
  try {
    if (type === 'png' && buffer.length >= 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (type === 'gif' && buffer.length >= 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (type === 'bmp' && buffer.length >= 26) {
      return { width: Math.abs(buffer.readInt32LE(18)), height: Math.abs(buffer.readInt32LE(22)) };
    }
    if (type === 'jpg') {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xFF) { offset++; continue; }
        const marker = buffer[offset + 1];
        if (marker >= 0xC0 && marker <= 0xC3) {
          return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
        }
        if (marker === 0xD8 || marker === 0xD9 || marker === 0x01) { offset += 2; continue; }
        const length = buffer.readUInt16BE(offset + 2);
        if (length < 2) break;
        offset += length + 2;
      }
    }
  } catch {
    return { width: 600, height: 400 };
  }
  return { width: 600, height: 400 };
}

function fitImage(size) {
  let { width, height } = size;
  if (!width || !height) return { width: 600, height: 400 };
  const scale = Math.min(1, 600 / width, 700 / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function readImage(href, baseDir) {
  if (!href) return null;
  let buffer;
  let mime = '';
  let ext = '';
  try {
    if (/^data:/i.test(href)) {
      const match = href.match(/^data:([^;,]+)?;base64,(.*)$/is);
      if (!match) return null;
      mime = match[1] || '';
      buffer = Buffer.from(match[2], 'base64');
    } else if (/^https?:/i.test(href)) {
      return null;
    } else if (/^file:/i.test(href)) {
      const filePath = fileURLToPath(href);
      buffer = fs.readFileSync(filePath);
      ext = path.extname(filePath);
    } else {
      const clean = href.replace(/&amp;/g, '&').split(/[?#]/)[0];
      const filePath = path.resolve(baseDir, decodeURIComponent(clean));
      buffer = fs.readFileSync(filePath);
      ext = path.extname(filePath);
    }
  } catch {
    return null;
  }
  const type = imageType(ext, mime);
  if (!type || !buffer || !buffer.length) return null;
  return { data: buffer, type, ...fitImage(imageDimensions(buffer, type)) };
}

function baseRun(text, state = {}) {
  return {
    text,
    bold: state.bold || undefined,
    italics: state.italics || undefined,
    strike: state.strike || undefined,
    style: state.code ? 'CodeChar' : undefined,
    font: state.code ? 'Consolas' : undefined,
    size: state.code ? 18 : undefined,
    color: state.link ? '0563C1' : undefined,
    underline: state.link ? {} : undefined,
  };
}

function mathRuns(text, style = 'InlineMath') {
  const runs = [];
  String(text || '').split('\n').forEach((line, index) => {
    if (index > 0) runs.push(new TextRun({ break: 1 }));
    if (line) runs.push(new TextRun({ text: line, style: style || undefined }));
  });
  return runs;
}

function inlineRuns(tokens, baseDir, state = {}) {
  const runs = [];
  const pushText = (value, extra = {}) => {
    const text = String(value == null ? '' : value);
    text.split('\n').forEach((part, index) => {
      if (index > 0) runs.push(new TextRun({ break: 1 }));
      if (part) runs.push(new TextRun(baseRun(part, { ...state, ...extra })));
    });
  };

  for (const token of tokens || []) {
    if (!token) continue;
    switch (token.type) {
      case 'text':
      case 'escape':
        pushText(token.text);
        break;
      case 'strong':
        runs.push(...inlineRuns(token.tokens, baseDir, { ...state, bold: true }));
        break;
      case 'em':
        runs.push(...inlineRuns(token.tokens, baseDir, { ...state, italics: true }));
        break;
      case 'del':
        runs.push(...inlineRuns(token.tokens, baseDir, { ...state, strike: true }));
        break;
      case 'codespan':
        pushText(token.text, { code: true });
        break;
      case 'mathInline':
        runs.push(...mathRuns(token.text));
        break;
      case 'br':
        runs.push(new TextRun({ break: 1 }));
        break;
      case 'link': {
        const children = inlineRuns(token.tokens, baseDir, { ...state, link: true });
        runs.push(new ExternalHyperlink({
          link: token.href,
          children: children.length ? children : [new TextRun(baseRun(token.text || token.href, { ...state, link: true }))],
        }));
        break;
      }
      case 'image': {
        const image = readImage(token.href, baseDir);
        if (image) {
          runs.push(new ImageRun({
            data: image.data,
            type: image.type,
            transformation: { width: image.width, height: image.height },
          }));
        } else {
          pushText(`[image: ${token.text || token.href || ''}]`, { italics: true });
        }
        break;
      }
      case 'html': {
        const text = String(token.text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
        pushText(text);
        break;
      }
      default:
        if (token.tokens) runs.push(...inlineRuns(token.tokens, baseDir, state));
        else if (token.text) pushText(token.text);
    }
  }
  return runs;
}

let numberingInstance = 0;

function listParagraphs(token, baseDir, level, extra = {}, quoted = false) {
  const paragraphs = [];
  const isQuote = quoted || extra.style === 'Quote';
  const listExtra = isQuote ? { ...extra, style: undefined } : extra;
  const reference = token.ordered ? 'md-numbers' : 'md-bullets';
  const instance = ++numberingInstance;
  for (const item of token.items || []) {
    const inline = [];
    const nested = [];
    for (const child of item.tokens || []) {
      if (child.type === 'list') nested.push(child);
      else if (child.type === 'text') inline.push(...(child.tokens || [child]));
      else if (child.type === 'paragraph') inline.push(...(child.tokens || []));
      else if (child.type !== 'space') inline.push(child);
    }
    if (item.task) inline.unshift({ type: 'text', text: item.checked ? '☑ ' : '☐ ' });
    const style = isQuote
      ? `Quote${token.ordered ? 'Number' : 'Bullet'}${Math.min(level, 4) + 1}`
      : listExtra.style;
    paragraphs.push(new Paragraph({
      ...listExtra,
      style,
      numbering: { reference, level: Math.min(level, 4), instance },
      children: inlineRuns(inline, baseDir),
    }));
    for (const child of nested) paragraphs.push(...listParagraphs(child, baseDir, level + 1, listExtra, isQuote));
  }
  return paragraphs;
}

function tableBlock(token, baseDir) {
  const rows = [token.header || [], ...(token.rows || [])];
  const tableRows = rows.map((cells, rowIndex) => new TableRow({
    children: (cells || []).map((cell) => {
      const alignment = cell.align === 'center'
        ? AlignmentType.CENTER
        : cell.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT;
      const alignStyle = cell.align === 'center'
        ? 'TableAlignCenter'
        : cell.align === 'right' ? 'TableAlignRight' : cell.align === 'left' ? 'TableAlignLeft' : undefined;
      return new TableCell({
        shading: rowIndex === 0 ? { fill: 'F2F2F2' } : undefined,
        children: [new Paragraph({
          style: alignStyle,
          alignment,
          children: inlineRuns(cell.tokens || [{ type: 'text', text: cell.text || '' }], baseDir, {
            bold: rowIndex === 0,
          }),
        })],
      });
    }),
  }));
  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE' },
    },
  });
}

function blockChildren(tokens, baseDir, quote = false) {
  const children = [];
  const quoteOptions = quote ? {
    style: 'Quote',
    indent: { left: 720 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC', space: 12 },
    },
  } : {};

  for (const token of tokens || []) {
    if (!token) continue;
    switch (token.type) {
      case 'space':
        break;
      case 'heading': {
        const depth = Math.min(Math.max(token.depth || 1, 1), 6);
        children.push(new Paragraph(quote
          ? { style: `QuoteHeading${depth}`, children: inlineRuns(token.tokens, baseDir) }
          : { heading: headingLevel(token.depth), children: inlineRuns(token.tokens, baseDir) }));
        break;
      }
      case 'paragraph':
        children.push(new Paragraph({ ...quoteOptions, children: inlineRuns(token.tokens, baseDir) }));
        break;
      case 'text':
        children.push(new Paragraph({ ...quoteOptions, children: inlineRuns(token.tokens || [{ type: 'text', text: token.text }], baseDir) }));
        break;
      case 'list':
        children.push(...listParagraphs(token, baseDir, 0, quoteOptions));
        break;
      case 'blockquote':
        children.push(...blockChildren(token.tokens, baseDir, true));
        break;
      case 'table':
        children.push(tableBlock(token, baseDir));
        break;
      case 'mathBlock':
        children.push(new Paragraph({
          ...quoteOptions,
          style: 'MathBlock',
          children: mathRuns(token.text, null),
        }));
        break;
      case 'code': {
        const codeRuns = [];
        String(token.text || '').split('\n').forEach((line, index) => {
          if (index > 0) codeRuns.push(new TextRun({ break: 1 }));
          codeRuns.push(new TextRun({ text: line, font: 'Consolas', size: 18 }));
        });
        children.push(new Paragraph({
          style: quote ? 'QuoteCode' : 'CodeBlock',
          shading: { fill: 'F2F2F2' },
          spacing: { before: 120, after: 120 },
          indent: quote ? { left: 720 } : { left: 240, right: 240 },
          border: quote ? {
            left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC', space: 12 },
          } : undefined,
          children: codeRuns,
        }));
        break;
      }
      case 'hr':
        children.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D0D7DE', space: 1 } },
          spacing: { before: 120, after: 120 },
        }));
        break;
      case 'html': {
        const text = String(token.text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
        if (text) children.push(new Paragraph({ ...quoteOptions, children: inlineRuns([{ type: 'text', text }], baseDir) }));
        break;
      }
      default:
        if (token.tokens) children.push(...blockChildren(token.tokens, baseDir, quote));
    }
  }
  return children;
}

async function markdownToDocx(md, { baseDir = process.cwd(), title = 'Markdown' } = {}) {
  numberingInstance = 0;
  const children = blockChildren(marked.lexer(md), baseDir);
  const document = new Document({
    creator: 'markdown-to',
    title,
    description: 'Converted from Markdown',
    numbering,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
          paragraph: { spacing: { after: 120 } },
        },
      },
      characterStyles: [{
        id: 'CodeChar',
        name: 'Code Char',
        basedOn: 'DefaultParagraphFont',
        run: { font: 'Consolas', size: 18 },
      }, {
        id: 'InlineMath',
        name: 'Inline Math',
        basedOn: 'DefaultParagraphFont',
        run: { font: 'Cambria Math', size: 22 },
      }],
      paragraphStyles: [{
        id: 'CodeBlock',
        name: 'Code Block',
        basedOn: 'Normal',
        paragraph: {
          spacing: { before: 120, after: 120 },
          indent: { left: 240, right: 240 },
        },
        run: { font: 'Consolas', size: 18 },
      }, {
        id: 'Quote',
        name: 'Quote',
        basedOn: 'Normal',
        paragraph: {
          indent: { left: 720 },
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC', space: 12 },
          },
        },
      }, {
        id: 'QuoteCode',
        name: 'Quote Code',
        basedOn: 'CodeBlock',
        paragraph: {
          indent: { left: 720 },
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC', space: 12 },
          },
        },
      }, ...quoteListStyles, ...quoteHeadingStyles, {
        id: 'MathBlock',
        name: 'Math Block',
        basedOn: 'Normal',
        paragraph: {
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
        },
        run: { font: 'Cambria Math', size: 22 },
      }, {
        id: 'TableAlignLeft',
        name: 'Table Align Left',
        basedOn: 'Normal',
        paragraph: { alignment: AlignmentType.LEFT },
      }, {
        id: 'TableAlignCenter',
        name: 'Table Align Center',
        basedOn: 'Normal',
        paragraph: { alignment: AlignmentType.CENTER },
      }, {
        id: 'TableAlignRight',
        name: 'Table Align Right',
        basedOn: 'Normal',
        paragraph: { alignment: AlignmentType.RIGHT },
      }],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    }],
  });
  return Packer.toBuffer(document);
}

module.exports = { markdownToDocx };
