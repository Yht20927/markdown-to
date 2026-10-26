---
name: md-to-format
description: Full-featured Markdown format converter suite — 16 tools replicating md-to.com, 100% local
triggers:
  - Convert markdown to
  - markdown format conversion
  - md to pdf
  - md to html
  - md to word
  - md to image
  - md to latex
  - markdown 格式转换
  - Convert file format
  - any markdown conversion task
---

# Markdown Format Converter Suite

全功能 Markdown 格式转换工具箱 — 16 个工具完整复刻 md-to.com，100% 本地处理。

## Tools Overview

### Markdown → Other Formats

| Tool | Output | Key Library | Speed |
|------|--------|-------------|-------|
| **md-to-pdf** | PDF (29 themes) | marked + puppeteer + katex | ~3s |
| **md-to-word** | Word .doc / .docx | marked + docx | <0.5s |
| **md-to-html** | HTML5 | marked + katex + hljs | <0.5s |
| **md-to-image** | PNG / JPG | marked + puppeteer + katex | ~2s |
| **md-to-text** | Plain Text | regex (md-to.com同逻辑) | <0.1s |
| **md-to-latex** | LaTeX .tex | regex pipeline | <0.3s |
| **md-to-rst** | reStructuredText | regex pipeline | <0.3s |
| **md-to-confluence** | Confluence wiki | regex | <0.2s |

### Other Formats → Markdown

| Tool | Input | Key Library | Speed |
|------|-------|-------------|-------|
| **html-to-md** | HTML → MD | turndown | <0.3s |
| **word-to-md** | .docx → MD | mammoth + turndown | <1s |
| **pdf-to-md** | PDF → MD | pdf-parse | <1s |

### Table Tools

| Tool | Direction | Key Library | Speed |
|------|-----------|-------------|-------|
| **csv-to-md** | CSV → MD Table | pure JS | <0.1s |
| **md-table-to-csv** | MD Table → CSV | pure JS | <0.1s |
| **json-to-md** | JSON → MD Table | pure JS | <0.1s |
| **md-table-to-image** | MD Table → PNG | marked + puppeteer + katex | ~2s |
| **md-table-to-pdf** | MD Table → PDF | marked + puppeteer + katex | ~2s |

## Trigger

Invoke this skill when the user needs any markdown format conversion.

## Commands

```bash
# All tools follow uniform CLI:
node <tool-dir>/index.js convert -i <input> -o <output>

# md-to-pdf extras:
node md-to-pdf/index.js list              # List 29 PDF themes
node md-to-pdf/index.js info <theme-id>   # Theme color/font details
node md-to-pdf/index.js convert -i in.md -o out.pdf -t <theme>
node md-to-pdf/index.js convert -i in.md -o out.pdf --no-page-numbers

# csv-to-md extras:
node csv-to-md/index.js convert -i in.csv -o out.md -d ','   # Specify delimiter

# md-to-word output:
node md-to-word/index.js convert -i in.md -o out.docx   # native OOXML
node md-to-word/index.js convert -i in.md -o out.doc    # HTML-as-doc

# word-to-md extras:
node word-to-md/index.js convert -i in.docx -o out.md --assets ./images

# Browser tools: remote images/fonts are blocked by default
node md-to-pdf/index.js convert -i in.md -o out.pdf --allow-remote
```

## Directory Layout

```
md-to-format/
├── SKILL.md              ← This file (master index)
├── md-to-pdf/            ← Markdown → PDF (29 themes)
├── md-to-word/           ← Markdown → Word .doc / .docx
├── md-to-html/           ← Markdown → HTML5
├── md-to-image/          ← Markdown → PNG/JPG
├── md-to-text/           ← Markdown → Plain Text
├── md-to-latex/          ← Markdown → LaTeX .tex
├── md-to-rst/            ← Markdown → reStructuredText
├── md-to-confluence/     ← Markdown → Confluence wiki
├── html-to-md/           ← HTML → Markdown
├── word-to-md/           ← Word .docx → Markdown
├── pdf-to-md/            ← PDF → Markdown
├── csv-to-md/            ← CSV → Markdown Table
├── md-table-to-csv/      ← Markdown Table → CSV
├── json-to-md/           ← JSON → Markdown Table
├── md-table-to-image/    ← Markdown Table → PNG/JPG
└── md-table-to-pdf/      ← Markdown Table → PDF
```
