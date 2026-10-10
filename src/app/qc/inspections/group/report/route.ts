import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildReportsForInspections } from "@/lib/qcReportData";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// All the reports for a PO / lot (one per commodity) as a single PDF:
// /qc/inspections/group/report?ids=<id>,<id>,...  (add &download=1 to save it).
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not signed in.", { status: 401 });

  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 20);
  if (ids.length === 0) return new NextResponse("No inspections given.", { status: 400 });

  const built = await buildReportsForInspections(supabase, ids);
  if (!built) return new NextResponse("Inspections not found.", { status: 404 });

  const download = url.searchParams.get("download") === "1";
  return new NextResponse(Buffer.from(built.merged), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${built.mergedName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
