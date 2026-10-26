---
name: md-to-word
description: Convert Markdown to native Word .docx (OOXML) or MSO-compatible HTML-as-.doc
triggers:
  - Convert Markdown to Word
  - Export markdown as doc
  - Markdown 转 Word
  - Generate Word document from md
  - md to docx
---

# md-to-word Skill

Convert Markdown to native Word `.docx` (OOXML) or MSO-compatible HTML-as-`.doc`. The `.docx` path supports headings, tables, lists, images, links, code blocks, quote blocks (including headings and nested lists), table alignment, and inline/display math.

## Usage

```bash
# Native OOXML .docx (recommended)
node index.js convert -i input.md -o output.docx

# Legacy HTML-as-.doc
node index.js convert -i input.md -o output.doc
```

Open either file in Microsoft Word or LibreOffice. `.docx` preserves native headings, tables, lists, images, hyperlinks, code blocks, and inline/display math source.
