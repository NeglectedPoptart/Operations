"use client";

import { Fragment, useMemo, useState } from "react";
import UpdateStatusButton from "@/components/UpdateStatusButton";
import type { FobFreightRate, FobItem, FobSection } from "@/lib/types";
import { copyOrDownloadPng, groupFobItems, roundUpToNickel } from "@/lib/fobPricing";
import { buildCategoryBlocks, renderBrandedPriceSheetPng } from "@/lib/fobPriceSheetImage";
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
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const laneLabel = capitalize(lane);

  function handleMessageBlur(e: React.FocusEvent<HTMLTextAreaElement>) {
    updateDeliveredMessage(lane, e.target.value).catch(() => {});
  }

  async function handleCopyImage() {
    const messageEl = document.getElementById("delivered-message") as HTMLTextAreaElement | null;
    const message = messageEl?.value ?? initialMessage;
    try {
      const westernGroups = groupFobItems(items, "western_veg");
      const hotHouseGroups = groupFobItems(items, "hot_house");
      const priceValues = (item: FobItem) => {
        const { ltl, ftl } = computeDelivered(item, freightRate);
        return [formatMoney(ltl) || "CALL", formatMoney(ftl) || "CALL"];
      };
      const blocks = [
        ...buildCategoryBlocks(westernGroups, priceValues),
        ...buildCategoryBlocks(hotHouseGroups, priceValues),
      ];
      const blob = await renderBrandedPriceSheetPng({
        subheaderText: `${laneLabel} Delivered`,
        priceColumns: ["LTL", "FTL"],
        subtitle: message,
        blocks,
        showSoldOutSection: true,
      });
      const result = await copyOrDownloadPng(blob, `${lane}-delivered-pricing.png`);
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen lg:mx-[calc(7.5rem-50vw)] lg:w-[calc(100vw-15rem)] px-4 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <UpdateStatusButton pageKey="fob-pharr" readOnly />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{laneLabel} Delivered Pricing</h1>
          <div className="flex gap-2">
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
