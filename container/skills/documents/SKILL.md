---
name: documents
description: Generate Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) documents. Use when the user asks for a document, report, spreadsheet, presentation, or file they can download or share.
allowed-tools: Bash(documents:*), Write
---

# Document Generation

Create Word, PowerPoint, and Excel files using globally installed npm packages. Write a Node.js script to `/tmp/gen-doc.mjs`, run it, and the output file goes to `/workspace/group/documents/`.

## Word Documents (docx)

```javascript
// /tmp/gen-doc.mjs
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } from 'docx';
import fs from 'fs';

fs.mkdirSync('/workspace/group/documents', { recursive: true });

const doc = new Document({
  sections: [{
    properties: {},
    children: [
      new Paragraph({ text: "Report Title", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ children: [new TextRun({ text: "Bold text", bold: true }), new TextRun(" and normal text.")] }),
      new Paragraph({ text: "A bullet point", bullet: { level: 0 } }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync('/workspace/group/documents/report.docx', buffer);
console.log('Created report.docx');
```

Run: `node /tmp/gen-doc.mjs`

## PowerPoint Presentations (pptxgenjs)

```javascript
// /tmp/gen-doc.mjs
import PptxGenJS from 'pptxgenjs';

const pptx = new PptxGenJS();
pptx.author = 'Woodrow';

let slide = pptx.addSlide();
slide.addText('Presentation Title', { x: 0.5, y: 0.5, w: '90%', fontSize: 36, bold: true, color: '363636' });
slide.addText('Subtitle here', { x: 0.5, y: 2, w: '90%', fontSize: 18, color: '666666' });

slide = pptx.addSlide();
slide.addText('Slide 2 Title', { x: 0.5, y: 0.5, w: '90%', fontSize: 28, bold: true });
slide.addText('• Point one\n• Point two\n• Point three', { x: 0.5, y: 1.5, w: '90%', fontSize: 16 });

import fs from 'fs';
fs.mkdirSync('/workspace/group/documents', { recursive: true });

await pptx.writeFile({ fileName: '/workspace/group/documents/presentation.pptx' });
console.log('Created presentation.pptx');
```

## Excel Spreadsheets (exceljs)

```javascript
// /tmp/gen-doc.mjs
import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
workbook.creator = 'Woodrow';
const sheet = workbook.addWorksheet('Sheet1');

sheet.columns = [
  { header: 'Name', key: 'name', width: 20 },
  { header: 'Amount', key: 'amount', width: 15 },
  { header: 'Date', key: 'date', width: 15 },
];

sheet.addRow({ name: 'Item 1', amount: 100, date: '2026-03-07' });
sheet.addRow({ name: 'Item 2', amount: 250, date: '2026-03-08' });

// Style header row
sheet.getRow(1).font = { bold: true };
sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

import fs from 'fs';
fs.mkdirSync('/workspace/group/documents', { recursive: true });

await workbook.xlsx.writeFile('/workspace/group/documents/spreadsheet.xlsx');
console.log('Created spreadsheet.xlsx');
```

## Workflow

1. Write the generation script to `/tmp/gen-doc.mjs`
2. Run it: `node /tmp/gen-doc.mjs`
3. The file is saved to `/workspace/group/documents/` where the user can access it
4. Tell the user the file is ready

## Tips

- Always save output files to `/workspace/group/documents/` (create the directory first with `fs.mkdirSync('/workspace/group/documents', { recursive: true })`)
- Use `.mjs` extension for ESM imports
- For tables in Word, use the Table/TableRow/TableCell classes
- For charts in Excel, use `workbook.addChart()` — but note chart rendering requires an Excel client
- PowerPoint supports images: `slide.addImage({ path: '/workspace/group/images/photo.png', x, y, w, h })`
