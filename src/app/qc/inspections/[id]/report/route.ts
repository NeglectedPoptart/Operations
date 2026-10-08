import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildReportForInspection } from "@/lib/qcReportData";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The inspection report as a PDF: /qc/inspections/<id>/report (shown in the
// browser) or ?download=1 (saved as a file). Signed-in users only; the
// database's own access rules apply to what's read.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not signed in.", { status: 401 });

  const { id } = await params;
  const report = await buildReportForInspection(supabase, id);
  if (!report) return new NextResponse("Inspection not found.", { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(Buffer.from(report.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${report.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
