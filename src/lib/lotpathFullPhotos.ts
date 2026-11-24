import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { isLotpathPhotoUrl } from "./lotpathPhotos";

// A LotPath report only carries tiny thumbnails; each one links to the full-size photo on LotPath. After an
// inspection is imported from an email, those full-size photos are fetched in the background (a few at a time on
// each 15-minute pass - a report can hold over a hundred, about 3 seconds each) and swapped in for the thumbnails.
// Sized like photos taken in HOPS (1600px, so a report PDF with 100+ photos stays a sensible size).

const KEY_PREFIX = "lotpath_hires:";
const MAX_DIM = 1600;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

interface Job {
  urls: (string | null)[];
  next: number;
}

export async function queueFullPhotos(db: SupabaseClient, inspectionId: string, urls: (string | null)[]): Promise<void> {
  if (!urls.some(Boolean)) return;
  const job: Job = { urls, next: 0 };
  await db.from("agent_state").upsert({ key: `${KEY_PREFIX}${inspectionId}`, value: JSON.stringify(job), updated_at: new Date().toISOString() });
}

async function fetchFull(url: string): Promise<Buffer | null> {
  if (!isLotpathPhotoUrl(url)) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "error" });
      if (!res.ok || !/^image\//i.test(res.headers.get("content-type") ?? "")) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_DOWNLOAD_BYTES) return null;
      return await sharp(bytes).rotate().resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    } catch {
      // try once more, then keep the thumbnail
    }
  }
  return null;
}

// Works through waiting inspections until the time budget runs out. Returns how many photos it upgraded.
export async function processFullPhotos(db: SupabaseClient, budgetMs = 25_000): Promise<{ upgraded: number; waiting: number }> {
  const started = Date.now();
  let upgraded = 0;
  const { data: jobs } = await db.from("agent_state").select("key, value").like("key", `${KEY_PREFIX}%`).limit(5);

  for (const row of jobs ?? []) {
    if (Date.now() - started > budgetMs) break;
    const key = row.key as string;
    const inspectionId = key.slice(KEY_PREFIX.length);
    let job: Job;
    try {
      job = JSON.parse(row.value as string) as Job;
    } catch {
      await db.from("agent_state").delete().eq("key", key);
      continue;
    }

    const { data: photoRows } = await db.from("qc_lot_photos").select("id, storage_path, position").eq("inspection_id", inspectionId);
    const byPosition = new Map((photoRows ?? []).map((p) => [p.position as number, p as { id: string; storage_path: string; position: number }]));
    if (byPosition.size === 0) {
      // The inspection (or its photos) was deleted.
      await db.from("agent_state").delete().eq("key", key);
      continue;
    }

    while (job.next < job.urls.length && Date.now() - started < budgetMs) {
      const batch = Array.from({ length: Math.min(6, job.urls.length - job.next) }, (_, k) => job.next + k);
      await Promise.all(
        batch.map(async (index) => {
          const url = job.urls[index];
          const photo = byPosition.get(index);
          if (!url || !photo) return;
          const full = await fetchFull(url);
          if (!full) return;
          const folder = photo.storage_path.slice(0, photo.storage_path.lastIndexOf("/"));
          const path = `${folder}/full-${String(index + 1).padStart(3, "0")}.jpg`;
          const { error } = await db.storage.from("qc-photos").upload(path, full, { contentType: "image/jpeg", upsert: true });
          if (error) return;
          const { error: updateError } = await db.from("qc_lot_photos").update({ storage_path: path }).eq("id", photo.id);
          if (updateError) return;
          await db.storage.from("qc-photos").remove([photo.storage_path]);
          upgraded++;
        }),
      );
      job.next += batch.length;
      await db.from("agent_state").upsert({ key, value: JSON.stringify(job), updated_at: new Date().toISOString() });
    }

    if (job.next >= job.urls.length) await db.from("agent_state").delete().eq("key", key);
  }

  const { count } = await db.from("agent_state").select("key", { count: "exact", head: true }).like("key", `${KEY_PREFIX}%`);
  return { upgraded, waiting: count ?? 0 };
}
