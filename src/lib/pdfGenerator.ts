// AssetFlow — Zero-dependency Adobe Acrobat compliant PDF generator
// Generates standard PDF 1.4 binary documents and print-ready reports

export interface PDFReportOptions {
  title: string;
  subtitle?: string;
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  summary?: { label: string; value: string }[];
  generatedBy?: string;
}

// Accurate Helvetica character widths (units per 1000 em)
const CHAR_WIDTHS: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 222,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
  '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
  '@': 1015,
  'A': 667, 'B': 667, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778, 'H': 722,
  'I': 278, 'J': 500, 'K': 667, 'L': 556, 'M': 833, 'N': 722, 'O': 778, 'P': 667,
  'Q': 778, 'R': 722, 'S': 667, 'T': 611, 'U': 722, 'V': 667, 'W': 944, 'X': 667,
  'Y': 667, 'Z': 611,
  '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556, '`': 222,
  'a': 556, 'b': 556, 'c': 500, 'd': 556, 'e': 556, 'f': 278, 'g': 556, 'h': 556,
  'i': 222, 'j': 222, 'k': 500, 'l': 222, 'm': 833, 'n': 556, 'o': 556, 'p': 556,
  'q': 556, 'r': 333, 's': 500, 't': 278, 'u': 556, 'v': 500, 'w': 722, 'x': 500,
  'y': 500, 'z': 500,
  '{': 334, '|': 260, '}': 334, '~': 584
};

function getCharWidth(ch: string): number {
  return CHAR_WIDTHS[ch] || 550;
}

export function measureText(str: string, fontSize: number): number {
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    w += (getCharWidth(str[i]) * fontSize) / 1000;
  }
  return w;
}

/**
 * Strips non-ASCII characters and maps common typography to pure ASCII.
 * Completely prevents the Adobe Acrobat glyph mapping error (where ellipsis turned into 'ƒ').
 */
export function sanitizeText(str: string | number | null | undefined): string {
  return String(str ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E]/g, '');
}

export function escapePDFText(str: string): string {
  return sanitizeText(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Truncates text with clean ASCII '...' to guarantee it never exceeds maxWidth points.
 */
export function fitText(str: string, maxWidth: number, fontSize: number): string {
  const clean = sanitizeText(str);
  if (measureText(clean, fontSize) <= maxWidth) return clean;

  const ell = '...';
  const ellW = measureText(ell, fontSize);
  if (maxWidth <= ellW) return '.';

  let low = 0;
  let high = clean.length;
  let best = '';

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = clean.slice(0, mid) + ell;
    if (measureText(candidate, fontSize) <= maxWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best || clean.slice(0, 1);
}

interface ColumnConfig {
  header: string;
  align: 'left' | 'center' | 'right';
  isCode?: boolean;
  isBadge?: boolean;
  isCondition?: boolean;
  isCost?: boolean;
  minWidth: number;
  flex: number;
}

/**
 * Generates an executive, beautifully arranged, Adobe Acrobat DC compliant PDF 1.4 document buffer.
 */
export function buildPDFDocument(options: PDFReportOptions): Uint8Array {
  const { title, subtitle, headers, rows, summary, generatedBy } = options;

  // For multi-column data (> 5 columns), default to Landscape A4 for optimal readability and breathing room.
  const isWide = headers.length > 5;
  const pageWidth = isWide ? 841.89 : 595.28;
  const pageHeight = isWide ? 595.28 : 841.89;
  const margin = 28;
  const printableWidth = pageWidth - margin * 2;

  // Intelligent Column Classification
  const colConfigs: ColumnConfig[] = headers.map(h => {
    const low = h.toLowerCase();
    if (low.includes('tag') || low.includes('sku') || low.includes('code') || low === '#') {
      return { header: h, align: 'left', isCode: true, minWidth: 68, flex: 1.0 };
    } else if (low.includes('cost') || low.includes('price') || low.includes('value') || low.includes('val') || low.includes('amount')) {
      return { header: h, align: 'right', isCost: true, minWidth: 66, flex: 1.0 };
    } else if (low.includes('status')) {
      return { header: h, align: 'center', isBadge: true, minWidth: 62, flex: 0.8 };
    } else if (low.includes('condition')) {
      return { header: h, align: 'center', isCondition: true, minWidth: 58, flex: 0.8 };
    } else if (low.includes('serial')) {
      return { header: h, align: 'left', isCode: true, minWidth: 78, flex: 1.2 };
    } else if (low.includes('name') || low.includes('title')) {
      return { header: h, align: 'left', minWidth: 110, flex: 2.2 };
    } else if (low.includes('location')) {
      return { header: h, align: 'left', minWidth: 95, flex: 1.8 };
    } else if (low.includes('dept') || low.includes('department')) {
      return { header: h, align: 'left', minWidth: 80, flex: 1.3 };
    } else if (low.includes('cat') || low.includes('category')) {
      return { header: h, align: 'left', minWidth: 80, flex: 1.3 };
    }
    return { header: h, align: 'left', minWidth: 50, flex: 1.0 };
  });

  const totalMinWidth = colConfigs.reduce((acc, c) => acc + c.minWidth, 0);
  const remainingSpace = Math.max(0, printableWidth - totalMinWidth);
  const totalFlex = colConfigs.reduce((acc, c) => acc + c.flex, 0);

  const colWidths = colConfigs.map(c => {
    if (remainingSpace > 0) {
      return c.minWidth + (c.flex / totalFlex) * remainingSpace;
    }
    return (c.minWidth / totalMinWidth) * printableWidth;
  });

  // Dynamic layout & pagination optimization
  // If report has <= 24 rows, fit comfortably on 1 single executive page!
  const fitsOnSinglePage = rows.length <= 24;
  const rowHeight = fitsOnSinglePage ? 16.8 : 18;
  const headerHeight = 22;
  const headerSectionHeight = 84 + (summary && summary.length > 0 ? 40 : 0);

  const rowsOnFirstPage = fitsOnSinglePage
    ? rows.length
    : Math.max(8, Math.floor((pageHeight - margin * 2 - headerSectionHeight - headerHeight - 20) / rowHeight));

  const rowsOnLaterPages = Math.max(12, Math.floor((pageHeight - margin * 2 - 32 - headerHeight - 20) / rowHeight));

  const pagesData: (string | number | null | undefined)[][][] = [];
  if (rows.length <= rowsOnFirstPage) {
    pagesData.push(rows);
  } else {
    pagesData.push(rows.slice(0, rowsOnFirstPage));
    let remaining = rows.slice(rowsOnFirstPage);
    while (remaining.length > 0) {
      pagesData.push(remaining.slice(0, rowsOnLaterPages));
      remaining = remaining.slice(rowsOnLaterPages);
    }
  }

  const numPages = pagesData.length;
  const pageIds: number[] = [];
  for (let p = 0; p < numPages; p++) {
    pageIds.push(5 + p * 2);
  }

  const catalog = `<< /Type /Catalog /Pages 2 0 R >>`;
  const pagesObj = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${numPages} >>`;
  // Ensure /WinAnsiEncoding is explicitly declared so Acrobat Reader correctly decodes all glyphs
  const fontF1 = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  const fontF2 = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;

  const pageObjects: string[] = [];
  const contentObjects: string[] = [];

  for (let p = 0; p < numPages; p++) {
    const pageNum = p + 1;
    const pageRows = pagesData[p];
    let stream = '';
    let y = pageHeight - margin;

    if (pageNum === 1) {
      // ASSETFLOW Brand Pill
      stream += `0.31 0.27 0.90 rg ${margin} ${y - 14} 76 16 re f\n`;
      stream += `BT /F2 8.5 Tf 1 1 1 rg ${margin + 6} ${y - 9.5} Td (ASSETFLOW) Tj ET\n`;

      // Top-Right Metadata Card
      const metaW = 215;
      const metaH = 34;
      const metaX = pageWidth - margin - metaW;
      const metaY = y - metaH + 2;
      stream += `0.97 0.98 0.99 rg ${metaX} ${metaY} ${metaW} ${metaH} re f\n`;
      stream += `0.88 0.90 0.93 RG 0.5 w ${metaX} ${metaY} ${metaW} ${metaH} re S\n`;

      const nowStr = new Date().toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      stream += `BT /F2 6.5 Tf 0.4 0.45 0.55 rg ${metaX + 8} ${y - 9} Td (DATE / TIME:) Tj ET\n`;
      stream += `BT /F1 7.5 Tf 0.1 0.12 0.2 rg ${metaX + 70} ${y - 9} Td (${escapePDFText(nowStr)}) Tj ET\n`;

      stream += `BT /F2 6.5 Tf 0.4 0.45 0.55 rg ${metaX + 8} ${y - 19} Td (GENERATED BY:) Tj ET\n`;
      stream += `BT /F1 7.5 Tf 0.1 0.12 0.2 rg ${metaX + 70} ${y - 19} Td (${escapePDFText(generatedBy || 'Admin')}) Tj ET\n`;

      stream += `BT /F2 6.5 Tf 0.4 0.45 0.55 rg ${metaX + 8} ${y - 28} Td (SECURITY:) Tj ET\n`;
      stream += `BT /F2 7 Tf 0.25 0.55 0.35 rg ${metaX + 70} ${y - 28} Td (Official Enterprise Export) Tj ET\n`;

      // Document Title & Subtitle
      stream += `BT /F2 15 Tf 0.08 0.1 0.18 rg ${margin} ${y - 32} Td (${escapePDFText(title)}) Tj ET\n`;
      if (subtitle) {
        stream += `BT /F1 8.5 Tf 0.42 0.46 0.54 rg ${margin} ${y - 45} Td (${escapePDFText(subtitle)}) Tj ET\n`;
      }

      y -= 54;

      // Executive Summary KPI Cards
      if (summary && summary.length > 0) {
        const gap = 8;
        const cardW = (printableWidth - (summary.length - 1) * gap) / summary.length;
        const cardH = 32;

        const accentColors = [
          [0.31, 0.27, 0.90], // Indigo
          [0.02, 0.52, 0.82], // Blue
          [0.06, 0.65, 0.38], // Emerald
          [0.55, 0.36, 0.96], // Violet
          [0.96, 0.62, 0.07], // Amber
        ];

        let cx = margin;
        for (let sIdx = 0; sIdx < summary.length; sIdx++) {
          const item = summary[sIdx];
          const color = accentColors[sIdx % accentColors.length];

          // Card Background & Crisp Border
          stream += `0.985 0.988 0.995 rg ${cx.toFixed(2)} ${(y - cardH).toFixed(2)} ${cardW.toFixed(2)} ${cardH} re f\n`;
          stream += `0.85 0.88 0.92 RG 0.5 w ${cx.toFixed(2)} ${(y - cardH).toFixed(2)} ${cardW.toFixed(2)} ${cardH} re S\n`;

          // Top Accent Color Highlight Line (2pt thick)
          stream += `${color[0]} ${color[1]} ${color[2]} rg ${cx.toFixed(2)} ${(y - 2).toFixed(2)} ${cardW.toFixed(2)} 2 re f\n`;

          // Label
          const labelText = fitText(item.label.toUpperCase(), cardW - 14, 6.5);
          stream += `BT /F2 6.5 Tf 0.42 0.46 0.55 rg ${(cx + 7).toFixed(2)} ${(y - 12).toFixed(2)} Td (${escapePDFText(labelText)}) Tj ET\n`;

          // Value
          const valText = fitText(item.value, cardW - 14, 11);
          stream += `BT /F2 11 Tf 0.08 0.1 0.18 rg ${(cx + 7).toFixed(2)} ${(y - 25).toFixed(2)} Td (${escapePDFText(valText)}) Tj ET\n`;

          cx += cardW + gap;
        }

        y -= cardH + 10;
      }

      // Elegant Divider Line
      stream += `0.85 0.88 0.92 RG 0.6 w ${margin} ${y} m ${pageWidth - margin} ${y} l S\n`;
      y -= 8;
    } else {
      // Continuation Header for Subsequent Pages
      stream += `BT /F2 9.5 Tf 0.25 0.28 0.38 rg ${margin} ${y - 4} Td (${escapePDFText(title)} (Continued)) Tj ET\n`;
      stream += `BT /F1 8 Tf 0.45 0.5 0.6 rg ${pageWidth - margin - 80} ${y - 4} Td (Page ${pageNum} of ${numPages}) Tj ET\n`;
      y -= 12;
      stream += `0.85 0.88 0.92 RG 0.6 w ${margin} ${y} m ${pageWidth - margin} ${y} l S\n`;
      y -= 8;
    }

    // Table Header Row (Navy Slate Background)
    stream += `0.12 0.15 0.24 rg ${margin} ${(y - headerHeight + 3).toFixed(2)} ${printableWidth.toFixed(2)} ${headerHeight} re f\n`;

    // Table Header Columns (Aligned with data columns)
    let colX = margin;
    const cellPadX = 6;
    for (let c = 0; c < colConfigs.length; c++) {
      const cfg = colConfigs[c];
      const w = colWidths[c];
      const usableW = w - cellPadX * 2;
      const headerText = fitText(cfg.header.toUpperCase(), usableW, 7.5);
      const textW = measureText(headerText, 7.5);

      let tx = colX + cellPadX;
      if (cfg.align === 'right') {
        tx = colX + w - cellPadX - textW;
      } else if (cfg.align === 'center') {
        tx = colX + (w - textW) / 2;
      }

      stream += `BT /F2 7.5 Tf 1 1 1 rg ${tx.toFixed(2)} ${(y - headerHeight + 9).toFixed(2)} Td (${escapePDFText(headerText)}) Tj ET\n`;
      colX += w;
    }
    y -= headerHeight;

    // Table Data Rows
    for (let r = 0; r < pageRows.length; r++) {
      const row = pageRows[r];

      // Subtle alternating zebra row background
      if (r % 2 === 1) {
        stream += `0.972 0.98 0.988 rg ${margin} ${(y - rowHeight + 3).toFixed(2)} ${printableWidth.toFixed(2)} ${rowHeight} re f\n`;
      }

      // Crisp horizontal row divider
      stream += `0.89 0.91 0.94 RG 0.5 w ${margin} ${(y - rowHeight + 3).toFixed(2)} m ${pageWidth - margin} ${(y - rowHeight + 3).toFixed(2)} l S\n`;

      colX = margin;
      for (let c = 0; c < colConfigs.length; c++) {
        const cfg = colConfigs[c];
        const w = colWidths[c];
        const rawVal = row[c] !== null && row[c] !== undefined ? String(row[c]) : '—';
        const usableW = w - cellPadX * 2;
        const cellText = fitText(rawVal, usableW, 7.5);
        const textW = measureText(cellText, 7.5);

        let tx = colX + cellPadX;
        if (cfg.align === 'right') {
          tx = colX + w - cellPadX - textW;
        } else if (cfg.align === 'center') {
          tx = colX + (w - textW) / 2;
        }

        const ty = y - rowHeight + 8;

        if (cfg.isBadge) {
          // Status Badge Pill
          const statusLower = rawVal.toLowerCase();
          let bgFill = '0.94 0.95 0.98';
          let textFill = '0.25 0.3 0.6';

          if (statusLower.includes('avail')) {
            bgFill = '0.91 0.97 0.93'; // Emerald
            textFill = '0.06 0.52 0.27';
          } else if (statusLower.includes('alloc')) {
            bgFill = '0.92 0.94 0.99'; // Indigo
            textFill = '0.24 0.28 0.72';
          } else if (statusLower.includes('maint')) {
            bgFill = '0.99 0.95 0.88'; // Amber
            textFill = '0.74 0.42 0.05';
          } else if (statusLower.includes('retir')) {
            bgFill = '0.99 0.92 0.93'; // Red
            textFill = '0.78 0.16 0.20';
          }

          const badgeW = Math.min(w - 6, textW + 10);
          const badgeX = colX + (w - badgeW) / 2;
          const badgeY = y - rowHeight + 4.5;
          const badgeH = 12;

          stream += `${bgFill} rg ${badgeX.toFixed(2)} ${badgeY.toFixed(2)} ${badgeW.toFixed(2)} ${badgeH} re f\n`;
          stream += `BT /F2 7 Tf ${textFill} rg ${tx.toFixed(2)} ${ty.toFixed(2)} Td (${escapePDFText(cellText)}) Tj ET\n`;
        } else if (cfg.isCondition) {
          // Condition text coloring
          const condLower = rawVal.toLowerCase();
          let textFill = '0.2 0.22 0.3';
          if (condLower.includes('excel') || condLower.includes('good')) {
            textFill = '0.06 0.52 0.27';
          } else if (condLower.includes('fair')) {
            textFill = '0.74 0.42 0.05';
          } else if (condLower.includes('poor')) {
            textFill = '0.78 0.16 0.20';
          }
          stream += `BT /F2 7.5 Tf ${textFill} rg ${tx.toFixed(2)} ${ty.toFixed(2)} Td (${escapePDFText(cellText)}) Tj ET\n`;
        } else if (cfg.isCode) {
          // Tag / SKU / Code (bold indigo font)
          stream += `BT /F2 7.5 Tf 0.22 0.28 0.68 rg ${tx.toFixed(2)} ${ty.toFixed(2)} Td (${escapePDFText(cellText)}) Tj ET\n`;
        } else if (cfg.isCost) {
          // Numbers / Currency (bold dark slate, flush right)
          stream += `BT /F2 7.5 Tf 0.12 0.15 0.22 rg ${tx.toFixed(2)} ${ty.toFixed(2)} Td (${escapePDFText(cellText)}) Tj ET\n`;
        } else {
          // Standard text
          stream += `BT /F1 7.5 Tf 0.16 0.18 0.25 rg ${tx.toFixed(2)} ${ty.toFixed(2)} Td (${escapePDFText(cellText)}) Tj ET\n`;
        }

        colX += w;
      }

      y -= rowHeight;
    }

    // Page Footer
    const footerY = margin - 14;
    stream += `0.85 0.88 0.92 RG 0.5 w ${margin} ${footerY + 14} m ${pageWidth - margin} ${footerY + 14} l S\n`;
    stream += `BT /F1 7.5 Tf 0.45 0.5 0.6 rg ${margin} ${footerY + 4} Td (AssetFlow Enterprise Suite  |  Confidential Internal Document  |  Total Records: ${rows.length}) Tj ET\n`;
    stream += `BT /F1 7.5 Tf 0.45 0.5 0.6 rg ${pageWidth - margin - 60} ${footerY + 4} Td (Page ${pageNum} of ${numPages}) Tj ET\n`;

    const streamBytes = new TextEncoder().encode(stream);
    const contentObj = `<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream`;
    const pageObj = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${6 + p * 2} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`;

    pageObjects.push(pageObj);
    contentObjects.push(contentObj);
  }

  // Assemble PDF Structure
  const allObjs: string[] = [
    catalog,
    pagesObj,
    fontF1,
    fontF2,
  ];

  for (let p = 0; p < numPages; p++) {
    allObjs.push(pageObjects[p]);
    allObjs.push(contentObjects[p]);
  }

  const header = '%PDF-1.4\n%âãÏÓ\n';
  let body = '';
  const offsets: number[] = [];

  const encoder = new TextEncoder();
  let currentOffset = encoder.encode(header).length;

  for (let i = 0; i < allObjs.length; i++) {
    offsets.push(currentOffset);
    const objStr = `${i + 1} 0 obj\n${allObjs[i]}\nendobj\n`;
    body += objStr;
    currentOffset += encoder.encode(objStr).length;
  }

  const xrefOffset = currentOffset;
  let xref = `xref\n0 ${allObjs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 0; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${allObjs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const fullPdfStr = header + body + xref + trailer;

  return encoder.encode(fullPdfStr);
}

/**
 * Downloads a generated PDF directly to the user's browser with the exact `.pdf` extension.
 */
export function downloadPDF(options: PDFReportOptions): { filename: string; sizeKB: string } {
  const bytes = buildPDFDocument(options);
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const cleanFilename = options.filename.endsWith('.pdf') ? options.filename : `${options.filename}.pdf`;
  a.href = url;
  a.download = cleanFilename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);

  return {
    filename: cleanFilename,
    sizeKB: (blob.size / 1024).toFixed(1),
  };
}

/**
 * Opens a print-formatted executive document in a popup or new tab ready for printing / Save as PDF.
 */
export function printReport(options: PDFReportOptions): void {
  const { title, subtitle, headers, rows, summary, generatedBy } = options;
  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) {
    alert('Please allow popups to print the report.');
    return;
  }

  const summaryHtml = summary && summary.length > 0
    ? `<div style="display:flex;gap:12px;margin:16px 0 20px;flex-wrap:wrap;">
        ${summary.map(s => `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:3px solid #6366f1;padding:10px 14px;border-radius:6px;min-width:130px;flex:1;">
            <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">${sanitizeText(s.label)}</div>
            <div style="font-size:16px;color:#0f172a;font-weight:700;margin-top:2px;">${sanitizeText(s.value)}</div>
          </div>
        `).join('')}
       </div>`
    : '';

  const tableHeadersHtml = headers.map(h => {
    const isCost = h.toLowerCase().includes('cost') || h.toLowerCase().includes('val');
    const isCenter = h.toLowerCase().includes('status') || h.toLowerCase().includes('condition');
    const align = isCost ? 'right' : isCenter ? 'center' : 'left';
    return `
      <th style="padding:8px 10px;background:#1e293b;color:#ffffff;font-size:11px;text-align:${align};font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">
        ${sanitizeText(h)}
      </th>
    `;
  }).join('');

  const tableRowsHtml = rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
      ${r.map((cell, cIdx) => {
        const h = headers[cIdx] ? headers[cIdx].toLowerCase() : '';
        const isCost = h.includes('cost') || h.includes('val');
        const isCenter = h.includes('status') || h.includes('condition');
        const isTag = cIdx === 0 && String(cell).startsWith('AST-');
        const align = isCost ? 'right' : isCenter ? 'center' : 'left';
        const color = isTag ? '#4f46e5' : '#1e293b';
        const fontW = isTag || isCost ? '600' : '400';

        return `
          <td style="padding:7px 10px;font-size:11.5px;color:${color};font-weight:${fontW};text-align:${align};border-bottom:1px solid #e2e8f0;">
            ${cell !== null && cell !== undefined ? sanitizeText(cell) : '—'}
          </td>
        `;
      }).join('')}
    </tr>
  `).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${sanitizeText(title)} — AssetFlow Report</title>
        <style>
          @page { size: landscape; margin: 12mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 16px; }
          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            thead { display: table-header-group; }
          }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom:16px;padding:10px 14px;background:#f1f5f9;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:13px;color:#475569;">Previewing <strong>${sanitizeText(title)}</strong> (${rows.length} records)</div>
          <button onclick="window.print()" style="background:#6366f1;color:white;border:none;padding:7px 14px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">
            Print / Save as PDF
          </button>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6366f1;padding-bottom:12px;margin-bottom:12px;">
          <div>
            <div style="display:inline-block;background:#4f46e5;color:white;padding:2px 7px;border-radius:4px;font-size:9.5px;font-weight:800;letter-spacing:0.06em;margin-bottom:5px;">ASSETFLOW ENTERPRISE</div>
            <h1 style="margin:0;font-size:20px;color:#0f172a;">${sanitizeText(title)}</h1>
            ${subtitle ? `<div style="font-size:12px;color:#64748b;margin-top:3px;">${sanitizeText(subtitle)}</div>` : ''}
          </div>
          <div style="text-align:right;font-size:11px;color:#64748b;line-height:1.45;">
            <div>Generated: <strong>${new Date().toLocaleString()}</strong></div>
            ${generatedBy ? `<div>Operator: <strong>${sanitizeText(generatedBy)}</strong></div>` : ''}
            <div>Records: <strong>${rows.length}</strong></div>
          </div>
        </div>

        ${summaryHtml}

        <table>
          <thead>
            <tr>${tableHeadersHtml}</tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:10px;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between;">
          <span>AssetFlow Enterprise Asset & Resource Suite — Confidential Internal Document</span>
          <span>Total Records: ${rows.length}</span>
        </div>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
}
