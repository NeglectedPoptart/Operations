import { createCanvas } from "@napi-rs/canvas";
import { extractImages, extractText, getDocumentProxy } from "unpdf";

// Pulls the photos out of a LotPath report PDF (in page order). The PDF embeds each photo as a small thumbnail
// (about 256px) that is a link to the full-size photo on LotPath - so each photo comes back as its thumbnail plus,
// when it can be matched, the address of the full-size one.

export async function pdfLooksLikeLotpath(data: Uint8Array): Promise<boolean> {
  try {
    const pdf = await getDocumentProxy(data.slice());
    const { text } = await extractText(pdf, { mergePages: true });
    return /Powered by Lotpath|lotpath\.com/i.test(text);
  } catch {
    return false;
  }
}

export interface LotpathPhoto {
  thumb: Buffer;
  fullUrl: string | null;
}

// Only LotPath's own public photo address is ever followed - a link in an emailed PDF is not trusted otherwise.
export function isLotpathPhotoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "apps.lotpath.com" && u.pathname === "/Public/InspectionPhoto" && u.searchParams.has("file");
  } catch {
    return false;
  }
}

export async function extractLotpathPhotos(data: Uint8Array, limit = 150): Promise<LotpathPhoto[]> {
  const pdf = await getDocumentProxy(data.slice());
  const out: LotpathPhoto[] = [];
  for (let p = 1; p <= pdf.numPages && out.length < limit; p++) {
    const images = await extractImages(pdf, p);
    const photos = images.filter((img) => img.width >= 64 && img.height >= 64); // logos and rules aren't photos

    // The links sit over the photos: read top-to-bottom, left-to-right like the photos themselves.
    const page = await pdf.getPage(p);
    const links = (await page.getAnnotations())
      .filter((a: { subtype?: string; url?: string }) => a.subtype === "Link" && typeof a.url === "string" && isLotpathPhotoUrl(a.url))
      .sort((a: { rect: number[] }, b: { rect: number[] }) => (Math.abs(b.rect[3] - a.rect[3]) > 8 ? b.rect[3] - a.rect[3] : a.rect[0] - b.rect[0]))
      .map((a: { url: string }) => a.url);
    const matched = links.length === photos.length;

    for (let i = 0; i < photos.length; i++) {
      if (out.length >= limit) break;
      const img = photos[i];
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d");
      const rgba = ctx.createImageData(img.width, img.height);
      const src = img.data;
      if (img.channels === 4) rgba.data.set(src);
      else if (img.channels === 3) {
        for (let k = 0, j = 0; k < src.length; k += 3, j += 4) {
          rgba.data[j] = src[k];
          rgba.data[j + 1] = src[k + 1];
          rgba.data[j + 2] = src[k + 2];
          rgba.data[j + 3] = 255;
        }
      } else if (img.channels === 1) {
        for (let k = 0, j = 0; k < src.length; k++, j += 4) {
          rgba.data[j] = rgba.data[j + 1] = rgba.data[j + 2] = src[k];
          rgba.data[j + 3] = 255;
        }
      } else continue;
      ctx.putImageData(rgba, 0, 0);
      out.push({ thumb: canvas.toBuffer("image/jpeg", 88), fullUrl: matched ? links[i] : null });
    }
  }
  return out;
}
