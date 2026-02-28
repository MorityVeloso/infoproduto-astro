/**
 * watermark.ts — Insere marca d'água discreta no rodapé de todas as páginas de um PDF.
 *
 * Usa pdf-lib com fonte Helvetica embutida (zero dependência externa).
 * O texto é centralizado, tamanho 8, cor cinza muted, opacidade 0.7.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const FONT_SIZE  = 8;
const FONT_COLOR = rgb(0.55, 0.55, 0.55);  // #8c8c8c — cinza discreto
const OPACITY    = 0.7;
const MARGIN_Y   = 12;  // pontos acima da margem inferior

/**
 * Recebe os bytes do PDF base e o texto da marca d'água.
 * Retorna os bytes do PDF com o rodapé inserido em todas as páginas.
 */
export async function generateWatermarkedPdf(
  basePdfBytes: Uint8Array,
  watermarkText: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(basePdfBytes, {
    ignoreEncryption: true,
  });

  const font  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const { width } = page.getSize();
    const textWidth  = font.widthOfTextAtSize(watermarkText, FONT_SIZE);
    const x          = (width - textWidth) / 2;  // centrado horizontalmente

    page.drawText(watermarkText, {
      x,
      y:       MARGIN_Y,
      size:    FONT_SIZE,
      font,
      color:   FONT_COLOR,
      opacity: OPACITY,
    });
  }

  return pdfDoc.save();
}
