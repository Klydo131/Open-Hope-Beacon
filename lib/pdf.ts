// A tiny, dependency-free PDF writer — just enough for the church report:
// text (Helvetica / Helvetica-Bold) and filled rectangles on one A4 page.
// PDF is a plain-text format; we build the objects and byte-accurate xref by
// hand and hand back a Blob. Keeping this in-house avoids adding a PDF library
// to a project that runs on free tiers.

type RGB = [number, number, number];

// Escape for PDF strings, and drop non-ASCII so byte length == string length
// (which keeps the xref offsets correct).
function esc(s: string): string {
  return String(s)
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/([\\()])/g, '\\$1');
}
const n = (x: number) => (+x).toFixed(2);

export class Pdf {
  private ops: string[] = [];
  readonly W = 595; // A4 points
  readonly H = 842;

  // x/y are measured from the TOP-LEFT for convenience; converted internally.
  text(
    x: number,
    yTop: number,
    str: string,
    opts: { size?: number; bold?: boolean; color?: RGB } = {},
  ) {
    const { size = 12, bold = false, color = [0, 0, 0] } = opts;
    const [r, g, b] = color.map((c) => c / 255);
    this.ops.push(
      `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${n(r)} ${n(g)} ${n(b)} rg ${n(x)} ${n(
        this.H - yTop,
      )} Td (${esc(str)}) Tj ET`,
    );
  }

  rect(x: number, yTop: number, w: number, h: number, color: RGB) {
    const [r, g, b] = color.map((c) => c / 255);
    this.ops.push(
      `${n(r)} ${n(g)} ${n(b)} rg ${n(x)} ${n(this.H - yTop - h)} ${n(w)} ${n(h)} re f`,
    );
  }

  blob(): Blob {
    const content = this.ops.join('\n');
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ];

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [];
    objs.forEach((body, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefStart = pdf.length;
    const size = objs.length + 1;
    pdf += `xref\n0 ${size}\n0000000000 65535 f \n`;
    offsets.forEach((off) => {
      pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return new Blob([pdf], { type: 'application/pdf' });
  }
}

// Trigger a browser download of a Blob.
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
