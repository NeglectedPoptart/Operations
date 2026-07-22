"use client";

import { Fragment, useMemo, useState } from "react";
import type { FobFreightRate, FobItem, FobSection } from "@/lib/types";
import {
  buildWhatsAppSection,
  copyOrDownloadPng,
  escapeHtml,
  groupFobItems,
  renderPriceSheetPng,
  roundUpToNickel,
  toMonoRows,
  type CanvasBlock,
  type FobItemGroup,
} from "@/lib/fobPricing";
import { updateEastCoastMessage } from "./actions";

function formatMoney(n: number | null) {
  return n === null ? "-" : `$${n.toFixed(2)}`;
}

// No LTL column here - these are flat long-haul lane rates (fob_freight_rates.ltl
// is null for NC/MD/PA/NJ), so only the FTL-per-pallet math applies.
function computeDelivered(item: FobItem, freight: FobFreightRate | undefined): number | null {
  if (!freight || freight.ftl === null || item.fob === null || item.unit_per === null || item.unit_per === 0) {
    return null;
  }
  return roundUpToNickel(item.fob + freight.ftl / 24 / item.unit_per);
}

function buildSectionHtml(
  title: string,
  headerBg: string,
  groups: FobItemGroup[],
  lanes: string[],
  freightByLane: Record<string, FobFreightRate>,
) {
  const colCount = 2 + lanes.length;
  const cell = "padding:3px 6px;border:1px solid #000;background:#ffffff;color:#000000;";
  const rows = groups
    .map(
      (g) => `
      <tr><td colspan="${colCount}" style="background:#f0f0f0;color:#000000;font-weight:bold;padding:4px 6px;border:1px solid #000;">${escapeHtml(g.name)}</td></tr>
      ${g.rows
        .map((r) => {
          const laneCells = lanes
            .map((lane) => {
              const price = computeDelivered(r, freightByLane[lane]);
              return `<td style="${cell}text-align:right;">${escapeHtml(formatMoney(price))}</td>`;
            })
            .join("");
          return `
        <tr>
          <td style="${cell}">${escapeHtml(r.variety ?? "")}</td>
          <td style="${cell}text-align:right;">${r.unit_per ?? ""}</td>
          ${laneCells}
        </tr>`;
        })
        .join("")}`,
    )
    .join("");
  const laneHeaders = lanes
    .map((lane) => `<td style="padding:3px 6px;border:1px solid #000;background:#dddddd;color:#000000;">${escapeHtml(lane)}</td>`)
    .join("");
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #000;font-family:Calibri,Arial,sans-serif;font-size:12.5px;background:#ffffff;color:#000000;">
      <tr><td colspan="${colCount}" style="background:${headerBg};color:#000000;font-weight:bold;text-align:center;padding:6px;border:1px solid #000;">${escapeHtml(title)}</td></tr>
      <tr style="background:#dddddd;color:#000000;font-weight:bold;">
        <td style="padding:3px 6px;border:1px solid #000;background:#dddddd;color:#000000;">Commodity</td>
        <td style="padding:3px 6px;border:1px solid #000;background:#dddddd;color:#000000;">Unit Per PLT</td>
        ${laneHeaders}
      </tr>
      ${rows}
    </table>`;
}

function buildPlainText(title: string, groups: FobItemGroup[], lanes: string[], freightByLane: Record<string, FobFreightRate>) {
  const lines = [title, `Commodity\tUnit Per PLT\t${lanes.join("\t")}`];
  for (const g of groups) {
    lines.push(g.name);
    for (const r of g.rows) {
      const laneValues = lanes.map((lane) => formatMoney(computeDelivered(r, freightByLane[lane])));
      lines.push(`${r.variety ?? ""}\t${r.unit_per ?? ""}\t${laneValues.join("\t")}`);
    }
  }
  return lines.join("\n");
}

function buildWhatsAppMessage(
  title: string,
  message: string,
  westernGroups: FobItemGroup[],
  hotHouseGroups: FobItemGroup[],
  lanes: string[],
  freightByLane: Record<string, FobFreightRate>,
) {
  const headers = ["Commodity", "Unit Per PLT", ...lanes];
  const rowValues = (item: FobItem) => [
    item.variety ?? "",
    item.unit_per !== null ? String(item.unit_per) : "",
    ...lanes.map((lane) => formatMoney(computeDelivered(item, freightByLane[lane]))),
  ];
  const western = buildWhatsAppSection("WESTERN VEG", westernGroups, headers, rowValues);
  const hotHouse = buildWhatsAppSection("HOT HOUSE", hotHouseGroups, headers, rowValues);
  return `*${title}*\n\n${message}\n\n${western}\n\n${hotHouse}`;
}

function EastCoastSection({
  title,
  section,
  items,
  lanes,
  freightByLane,
}: {
  title: string;
  section: FobSection;
  items: FobItem[];
  lanes: string[];
  freightByLane: Record<string, FobFreightRate>;
}) {
  const groups = useMemo(() => groupFobItems(items, section), [items, section]);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Commodity</th>
              <th className="px-2 py-2">Unit Per PLT</th>
              {lanes.map((lane) => (
                <th key={lane} className="px-2 py-2">
                  {lane}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.name}>
                <tr className="border-t border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5">
                  <td colSpan={2 + lanes.length} className="px-3 py-1.5 text-sm font-bold">
                    {g.name}
                  </td>
                </tr>
                {g.rows.map((item) => (
                  <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-1">{item.variety ?? ""}</td>
                    <td className="px-3 py-1">{item.unit_per ?? ""}</td>
                    {lanes.map((lane) => (
                      <td key={lane} className="px-3 py-1 font-semibold">
                        {formatMoney(computeDelivered(item, freightByLane[lane]))}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={2 + lanes.length} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EastCoastPricingClient({
  items,
  lanes,
  freightRates,
  initialMessage,
}: {
  items: FobItem[];
  lanes: string[];
  freightRates: FobFreightRate[];
  initialMessage: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const emailTitle = "EAST COAST DELIVERED PRICE SHEET";

  const freightByLane = useMemo(() => {
    const map: Record<string, FobFreightRate> = {};
    for (const r of freightRates) map[r.lane.toUpperCase()] = r;
    return map;
  }, [freightRates]);

  function handleMessageBlur(e: React.FocusEvent<HTMLTextAreaElement>) {
    updateEastCoastMessage(e.target.value).catch(() => {});
  }

  function buildFullHtml(message: string) {
    const westernGroups = groupFobItems(items, "western_veg");
    const hotHouseGroups = groupFobItems(items, "hot_house");

    const headerHtml = `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;margin-bottom:10px;background:#ffffff;">
      <tr><td style="text-align:center;font-size:18px;font-weight:bold;padding-bottom:8px;background:#ffffff;color:#000000;">${escapeHtml(emailTitle)}</td></tr>
      <tr><td style="text-align:center;border:1px solid #000;padding:6px;font-size:12.5px;background:#ffffff;color:#000000;">${escapeHtml(message)}</td></tr>
    </table>`;

    return `${headerHtml}<table cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr>
        <td valign="top" style="background:#ffffff;">${buildSectionHtml("Western Veg", "#8DC63F", westernGroups, lanes, freightByLane)}</td>
        <td style="width:24px;background:#ffffff;">&nbsp;</td>
        <td valign="top" style="background:#ffffff;">${buildSectionHtml("Hot House", "#FF3333", hotHouseGroups, lanes, freightByLane)}</td>
      </tr></table>`;
  }

  async function handleCopy() {
    const westernGroups = groupFobItems(items, "western_veg");
    const hotHouseGroups = groupFobItems(items, "hot_house");
    const messageEl = document.getElementById("east-coast-message") as HTMLTextAreaElement | null;
    const message = messageEl?.value ?? initialMessage;

    const html = buildFullHtml(message);
    const text = `${emailTitle}\n\n${message}\n\n${buildPlainText("Western Veg", westernGroups, lanes, freightByLane)}\n\n${buildPlainText("Hot House", hotHouseGroups, lanes, freightByLane)}`;

    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Could not copy to clipboard - your browser may not support it.");
    }
  }

  async function handleCopyWhatsApp() {
    const westernGroups = groupFobItems(items, "western_veg");
    const hotHouseGroups = groupFobItems(items, "hot_house");
    const messageEl = document.getElementById("east-coast-message") as HTMLTextAreaElement | null;
    const message = messageEl?.value ?? initialMessage;
    const text = buildWhatsAppMessage(emailTitle, message, westernGroups, hotHouseGroups, lanes, freightByLane);

    try {
      await navigator.clipboard.writeText(text);
      setCopiedWhatsApp(true);
      setTimeout(() => setCopiedWhatsApp(false), 2000);
    } catch {
      alert("Could not copy to clipboard - your browser may not support it.");
    }
  }

  async function handleCopyImage() {
    const messageEl = document.getElementById("east-coast-message") as HTMLTextAreaElement | null;
    const message = messageEl?.value ?? initialMessage;
    try {
      const westernGroups = groupFobItems(items, "western_veg");
      const hotHouseGroups = groupFobItems(items, "hot_house");
      const headers = ["Commodity", "Unit Per PLT", ...lanes];
      const rowValues = (item: FobItem) => [
        item.variety ?? "",
        item.unit_per !== null ? String(item.unit_per) : "",
        ...lanes.map((lane) => formatMoney(computeDelivered(item, freightByLane[lane]))),
      ];
      const blocks: CanvasBlock[] = [
        { title: "Western Veg", headerColor: "#8DC63F", columnHeaders: headers, rows: toMonoRows(westernGroups, rowValues) },
        { title: "Hot House", headerColor: "#FF3333", columnHeaders: headers, rows: toMonoRows(hotHouseGroups, rowValues) },
      ];
      const blob = await renderPriceSheetPng({ title: emailTitle, message, blocks });
      const result = await copyOrDownloadPng(blob, "east-coast-delivered-pricing.png");
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">East Coast Delivered Pricing</h1>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              {copied ? "Copied!" : "Copy Price Sheet"}
            </button>
            <button
              onClick={handleCopyWhatsApp}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            >
              {copiedWhatsApp ? "Copied!" : "Copy for WhatsApp"}
            </button>
            <button
              onClick={handleCopyImage}
              className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
            >
              {imageStatus ?? "Copy as Image"}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-black/60 dark:text-white/60">
            Message under the title (edit for specials, etc.)
          </label>
          <textarea
            id="east-coast-message"
            defaultValue={initialMessage}
            onBlur={handleMessageBlur}
            rows={2}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <EastCoastSection
            title="Western Veg"
            section="western_veg"
            items={items}
            lanes={lanes}
            freightByLane={freightByLane}
          />
          <EastCoastSection
            title="Hot House"
            section="hot_house"
            items={items}
            lanes={lanes}
            freightByLane={freightByLane}
          />
        </div>
      </div>
    </div>
  );
}
