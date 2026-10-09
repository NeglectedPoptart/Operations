import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { APP_TIMEZONE } from "@/lib/dates";
import { buildSeries, metricOptions, metricValue, resultCounts, type GroupBy } from "@/lib/qcCharts";
import { buildDashboardPdf, type PdfTableRow } from "@/lib/qcDashboardPdf";
import type { PlanConfig } from "@/lib/qcPlans";
import { getChartData } from "../actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TABLE_METRICS = 7;

// The Quality Dashboard as a PDF for the plan and dates that were applied:
// /qc/dashboard/export?plan=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD&group=none|grower|inspector
//   &dots=1&data=1&metrics=<comma-separated metric ids>
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Not signed in.", { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams;
  const planId = q.get("plan") ?? "";
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  const group = (["grower", "inspector"].includes(q.get("group") ?? "") ? q.get("group") : "none") as GroupBy;
  const showEach = q.get("dots") === "1";
  const wantTable = q.get("data") === "1";
  const wanted = (q.get("metrics") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!planId || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new NextResponse("Missing plan or dates.", { status: 400 });
  }

  const { data: plan } = await supabase.from("qc_plans").select("id, name, config").eq("id", planId).maybeSingle();
  if (!plan) return new NextResponse("Plan not found.", { status: 404 });
  const config = plan.config as PlanConfig;

  const result = await getChartData(planId, from, to);
  if ("error" in result) return new NextResponse(result.error, { status: 500 });
  const rows = result.rows;

  const options = metricOptions(config);
  const chosen = wanted.length > 0 ? options.filter((m) => wanted.includes(m.id)) : options.slice(0, 1);
  if (chosen.length === 0) return new NextResponse("No charts chosen.", { status: 400 });

  const charts = chosen.map((m) => {
    const built = buildSeries(rows, m.id, group, showEach);
    return { title: m.label, unit: m.unit, fromZero: m.fromZero, series: built.series, stats: built.stats, groupCount: built.groupCount };
  });

  // Who is exporting: their employee name if linked, otherwise their login name.
  const { data: emp } = await supabase.from("employees").select("name").eq("linked_user_id", user.id).maybeSingle();
  const exportedBy = emp?.name?.trim() || (user.email ?? "Unknown").split("@")[0];

  // Logo from the site's own public folder; plain text header if it can't be read.
  let logo: Uint8Array | null = null;
  try {
    const res = await fetch(`${url.origin}/logo-harvest-best.png`);
    if (res.ok) logo = new Uint8Array(await res.arrayBuffer());
  } catch {
    logo = null;
  }

  let table: { metricLabels: string[]; rows: PdfTableRow[] } | null = null;
  if (wantTable) {
    const cols = chosen.slice(0, MAX_TABLE_METRICS);
    table = {
      metricLabels: cols.map((m) => (m.unit ? `${m.label} (${m.unit})` : m.label)),
      rows: rows.map((r) => ({
        date: new Date(r.inspection_time).toLocaleDateString("en-US", { timeZone: APP_TIMEZONE, month: "numeric", day: "numeric", year: "2-digit" }),
        lot: r.lot_number ?? "",
        grower: r.grower ?? "",
        result: r.result ?? "",
        values: cols.map((m) => {
          const v = metricValue(r, m.id);
          return v ? String(Number(v.value.toFixed(2))) : "-";
        }),
      })),
    };
  }

  const pdf = await buildDashboardPdf({
    planName: plan.name as string,
    from,
    to,
    compareBy: group === "grower" ? "Grower" : group === "inspector" ? "Inspector" : "",
    inspections: rows.length,
    results: resultCounts(rows),
    exportedBy,
    exportedAt: new Date(),
    charts,
    logo,
    table,
  });

  const fileName = `Quality Report - ${(plan.name as string).replace(/[\\/:*?"<>|]/g, "-")} - ${from} to ${to}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
