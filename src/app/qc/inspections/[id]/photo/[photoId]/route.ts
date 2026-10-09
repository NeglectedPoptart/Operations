import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// One inspection photo's bytes from our own address (so the browser can turn it
// into a file for sharing without any cross-site restrictions). Signed-in users
// only; the database's own access rules apply to what's read.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not signed in.", { status: 401 });

  const { id, photoId } = await params;
  const { data: row } = await supabase.from("qc_lot_photos").select("storage_path").eq("id", photoId).eq("inspection_id", id).maybeSingle();
  if (!row) return new NextResponse("Photo not found.", { status: 404 });
  const { data, error } = await supabase.storage.from("qc-photos").download(row.storage_path as string);
  if (error || !data) return new NextResponse("Photo not found.", { status: 404 });

  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
}
