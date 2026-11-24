import { createCanvas } from "@napi-rs/canvas";
import { extractImages, extractText, getDocumentProxy } from "unpdf";

// Pulls the photos out of a LotPath report PDF (in page order) as JPEGs. LotPath embeds them small (about 256px) -
// they are kept exactly as they are in the report.

export async function pdfLooksLikeLotpath(data: Uint8Array): Promise<boolean> {
  try {
    const pdf = await getDocumentProxy(data.slice());
    const { text } = await extractText(pdf, { mergePages: true });
    return /Powered by Lotpath|lotpath\.com/i.test(text);
  } catch {
    return false;
  }
}

export async function extractLotpathPhotos(data: Uint8Array, limit = 150): Promise<Buffer[]> {
  const pdf = await getDocumentProxy(data.slice());
  const out: Buffer[] = [];
  for (let p = 1; p <= pdf.numPages && out.length < limit; p++) {
    const images = await extractImages(pdf, p);
    for (const img of images) {
      if (out.length >= limit) break;
      if (img.width < 64 || img.height < 64) continue; // logos and rules, not photos
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d");
      const rgba = ctx.createImageData(img.width, img.height);
      const src = img.data;
      if (img.channels === 4) rgba.data.set(src);
      else if (img.channels === 3) {
        for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
          rgba.data[j] = src[i];
          rgba.data[j + 1] = src[i + 1];
          rgba.data[j + 2] = src[i + 2];
          rgba.data[j + 3] = 255;
        }
      } else if (img.channels === 1) {
        for (let i = 0, j = 0; i < src.length; i++, j += 4) {
          rgba.data[j] = rgba.data[j + 1] = rgba.data[j + 2] = src[i];
          rgba.data[j + 3] = 255;
        }
      } else continue;
      ctx.putImageData(rgba, 0, 0);
      out.push(canvas.toBuffer("image/jpeg", 88));
    }
  }
  return out;
}
