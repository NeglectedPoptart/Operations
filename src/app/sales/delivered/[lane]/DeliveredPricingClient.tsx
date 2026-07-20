"use client";

import { Fragment, useMemo, useState } from "react";
import type { FobFreightRate, FobItem, FobSection } from "@/lib/types";
import { escapeHtml, groupFobItems, roundUpToNickel, type FobItemGroup } from "@/lib/fobPricing";
import { updateDeliveredMessage } from "./actions";

function formatMoney(n: number | null) {
  return n === null ? "" : `$${n.toFixed(2)}`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Delivered price = FOB (per case) + freight cost per case, rounded up to
// the nearest nickel. LTL's rate is already $/pallet (fob_freight_rates.ltl);
// FTL's rate is a flat full-truck price, so it's divided by 24 pallets
// first. Either freight figure is then divided by unit_per (cases/pallet)
// to land in the same $/case unit as FOB before adding.
function computeDelivered(item: FobItem, freight: FobFreightRate) {
  if (item.fob === null || item.unit_per === null || item.unit_per === 0) {
    return { ltl: null as number | null, ftl: null as number | null };
  }
  const ltl = freight.ltl !== null ? roundUpToNickel(item.fob + freight.ltl / item.unit_per) : null;
  const ftl = freight.ftl !== null ? roundUpToNickel(item.fob + freight.ftl / 24 / item.unit_per) : null;
  return { ltl, ftl };
}

function buildSectionHtml(
  title: string,
  headerBg: string,
  groups: FobItemGroup[],
  freight: FobFreightRate,
  laneLabel: string,
) {
  const cell = "padding:3px 6px;border:1px solid #000;background:#ffffff;color:#000000;";
  const rows = groups
    .map(
      (g) => `
      <tr><td colspan="4" style="background:#f0f0f0;color:#000000;font-weight:bold;padding:4px 6px;border:1px solid #000;">${escapeHtml(g.name)}</td></tr>
      ${g.rows
        .map((r) => {
          const { ltl, ftl } = computeDelivered(r, freight);
          return `
        <tr>
          <td style="${cell}">${escapeHtml(r.variety ?? "")}</td>
          <td style="${cell}text-align:right;">${r.unit_per ?? ""}</td>
          <td style="${cell}text-align:right;">${escapeHtml(formatMoney(ltl))}</td>
          <td style="${cell}text-align:right;">${escapeHtml(formatMoney(ftl))}</td>
        </tr>`;
        })
        .join("")}`,
    )
    .join("");
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #000;font-family:Calibri,Arial,sans-serif;font-size:12.5px;background:#ffffff;color:#000000;">
      <tr><td colspan="4" style="background:${headerBg};color:#000000;font-weight:bold;text-align:center;padding:6px;border:1px solid #000;">${escapeHtml(title)}</td></tr>
      <tr style="background:#dddddd;color:#000000;font-weight:bold;">
        <td style="padding:3px 6px;border:1px solid #000;background:#dddddd;color:#000000;">Commodity</td>
        <td style="padding:3px 6px;border:1px solid #000;background:#dddddd;color:#000000;">Unit Per</td>
        <td style="padding:3px 6px;border:1px solid #000;background:#dddddd;color:#000000;">${escapeHtml(laneLabel)} LTL</td>
        <td style="padding:3px 6px;border:1px solid #000;background:#dddddd;color:#000000;">${escapeHtml(laneLabel)} FTL</td>
      </tr>
      ${rows}
    </table>`;
}

function buildPlainText(title: string, groups: FobItemGroup[], freight: FobFreightRate, laneLabel: string) {
  const lines = [title, `Commodity\tUnit Per\t${laneLabel} LTL\t${laneLabel} FTL`];
  for (const g of groups) {
    lines.push(g.name);
    for (const r of g.rows) {
      const { ltl, ftl } = computeDelivered(r, freight);
      lines.push(`${r.variety ?? ""}\t${r.unit_per ?? ""}\t${formatMoney(ltl)}\t${formatMoney(ftl)}`);
    }
  }
  return lines.join("\n");
}

function DeliveredSection({
  title,
  section,
  items,
  freight,
  laneLabel,
}: {
  title: string;
  section: FobSection;
  items: FobItem[];
  freight: FobFreightRate;
  laneLabel: string;
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
              <th className="px-2 py-2">Unit Per</th>
              <th className="px-2 py-2">{laneLabel} LTL</th>
              <th className="px-2 py-2">{laneLabel} FTL</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.name}>
                <tr className="border-t border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5">
                  <td colSpan={4} className="px-3 py-1.5 text-sm font-bold">
                    {g.name}
                  </td>
                </tr>
                {g.rows.map((item) => {
                  const { ltl, ftl } = computeDelivered(item, freight);
                  return (
                    <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-3 py-1">{item.variety ?? ""}</td>
                      <td className="px-3 py-1">{item.unit_per ?? ""}</td>
                      <td className="px-3 py-1 font-semibold">{formatMoney(ltl) || "-"}</td>
                      <td className="px-3 py-1 font-semibold">{formatMoney(ftl) || "-"}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
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

export default function DeliveredPricingClient({
  lane,
  items,
  freightRate,
  initialMessage,
}: {
  lane: string;
  items: FobItem[];
  freightRate: FobFreightRate;
  initialMessage: string;
}) {
  const [copied, setCopied] = useState(false);
  const laneLabel = capitalize(lane);
  const emailTitle = `${lane.toUpperCase()} DELIVERED PRICING`;

  function handleMessageBlur(e: React.FocusEvent<HTMLTextAreaElement>) {
    updateDeliveredMessage(lane, e.target.value).catch(() => {});
  }

  async function handleCopy() {
    const westernGroups = groupFobItems(items, "western_veg");
    const hotHouseGroups = groupFobItems(items, "hot_house");
    const messageEl = document.getElementById("delivered-message") as HTMLTextAreaElement | null;
    const message = messageEl?.value ?? initialMessage;

    const headerHtml = `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;margin-bottom:10px;background:#ffffff;">
      <tr><td style="text-align:center;font-size:18px;font-weight:bold;padding-bottom:8px;background:#ffffff;color:#000000;">${escapeHtml(emailTitle)}</td></tr>
      <tr><td style="text-align:center;border:1px solid #000;padding:6px;font-size:12.5px;background:#ffffff;color:#000000;">${escapeHtml(message)}</td></tr>
    </table>`;

    const html = `${headerHtml}<table cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr>
        <td valign="top" style="background:#ffffff;">${buildSectionHtml("Western Veg", "#8DC63F", westernGroups, freightRate, laneLabel)}</td>
        <td style="width:24px;background:#ffffff;">&nbsp;</td>
        <td valign="top" style="background:#ffffff;">${buildSectionHtml("Hot House", "#FF3333", hotHouseGroups, freightRate, laneLabel)}</td>
      </tr></table>`;
    const text = `${emailTitle}\n\n${message}\n\n${buildPlainText("Western Veg", westernGroups, freightRate, laneLabel)}\n\n${buildPlainText("Hot House", hotHouseGroups, freightRate, laneLabel)}`;

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

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{laneLabel} Delivered Pricing</h1>
          <button
            onClick={handleCopy}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            {copied ? "Copied!" : "Copy Price Sheet"}
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-black/60 dark:text-white/60">
            Message under the title (edit for specials, etc.)
          </label>
          <textarea
            id="delivered-message"
            defaultValue={initialMessage}
            onBlur={handleMessageBlur}
            rows={2}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <DeliveredSection
            title="Western Veg"
            section="western_veg"
            items={items}
            freight={freightRate}
            laneLabel={laneLabel}
          />
          <DeliveredSection
            title="Hot House"
            section="hot_house"
            items={items}
            freight={freightRate}
            laneLabel={laneLabel}
          />
        </div>
      </div>
    </div>
  );
}
