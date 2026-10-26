---
name: pdf-to-md
description: Convert PDF to Markdown with font/position-aware structure recovery (100% local)
triggers:
  - Convert PDF to Markdown
  - Extract text from PDF
  - PDF 转 Markdown
  - Get readable content from PDF files
  - pdf to md
---

# pdf-to-md Skill

Convert PDF to Markdown with font-size and text-position heuristics. Recovers headings, paragraphs, lists, GFM tables, fenced code blocks, and removes page numbers; falls back to plain text extraction when layout data is unavailable.

## Usage

```bash
node index.js convert -i document.pdf -o output.md

# Allow empty output for scanned/image-only PDFs
node index.js convert -i document.pdf -o output.md --allow-empty
```

Layout recovery is heuristic. Complex multi-column layouts may need manual cleanup; scanned PDFs require OCR before conversion.
