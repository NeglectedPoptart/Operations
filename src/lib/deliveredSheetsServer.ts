import fs from "node:fs";
import path from "node:path";
import { createCanvas, GlobalFonts, Image } from "@napi-rs/canvas";
import { drawBrandedPriceSheet, type PriceSheetDrawEnv, type PriceSheetOptions } from "./fobPriceSheetImage";

// Draws a Delivered price sheet on the server (for the Delivered price sheet agent), with the same drawing code the
// Delivered pages use in the browser. Arial and Georgia aren't installed on the server, so the open-licence
// look-alikes bundled in src/lib/fonts are registered under those names - the sheet's fonts line up with the
// browser version and its text measures the same.

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), "src", "lib", "fonts");
  GlobalFonts.registerFromPath(path.join(dir, "Arimo.ttf"), "Arial");
  GlobalFonts.registerFromPath(path.join(dir, "Gelasio.ttf"), "Georgia");
  fontsReady = true;
}

const env: PriceSheetDrawEnv = {
  createCanvas: (width, height) => createCanvas(width, height) as unknown as ReturnType<PriceSheetDrawEnv["createCanvas"]>,
  loadLogo: async () => {
    const image = new Image();
    image.src = fs.readFileSync(path.join(process.cwd(), "public", "logo-hbi-2025-white.png"));
    return image;
  },
};

// A very tall sheet as a PNG can be several MB, so a big one is sent as a high-quality JPEG instead.
const MAX_PNG_BYTES = 3_000_000;

export async function renderDeliveredSheetImage(options: PriceSheetOptions): Promise<{ data: Buffer; contentType: "image/png" | "image/jpeg" }> {
  ensureFonts();
  const canvas = (await drawBrandedPriceSheet(options, env)) as unknown as { toBuffer(mime: "image/png" | "image/jpeg", quality?: number): Buffer };
  const png = canvas.toBuffer("image/png");
  if (png.length <= MAX_PNG_BYTES) return { data: png, contentType: "image/png" };
  return { data: canvas.toBuffer("image/jpeg", 92), contentType: "image/jpeg" };
}
