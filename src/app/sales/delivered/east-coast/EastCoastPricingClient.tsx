"use client";

import { Fragment, useMemo, useState } from "react";
import UpdateStatusButton from "@/components/UpdateStatusButton";
import type { FobFreightRate, FobItem, FobSection } from "@/lib/types";
import { copyOrDownloadPng, groupFobItems, roundUpToNickel } from "@/lib/fobPricing";
import { buildCategoryBlocks, renderBrandedPriceSheetPng } from "@/lib/fobPriceSheetImage";
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
  const [imageStatus, setImageStatus] = useState<string | null>(null);

  const freightByLane = useMemo(() => {
    const map: Record<string, FobFreightRate> = {};
    for (const r of freightRates) map[r.lane.toUpperCase()] = r;
    return map;
  }, [freightRates]);

  function handleMessageBlur(e: React.FocusEvent<HTMLTextAreaElement>) {
    updateEastCoastMessage(e.target.value).catch(() => {});
  }

  async function handleCopyImage() {
    const messageEl = document.getElementById("east-coast-message") as HTMLTextAreaElement | null;
    const message = messageEl?.value ?? initialMessage;
    try {
      const westernGroups = groupFobItems(items, "western_veg");
      const hotHouseGroups = groupFobItems(items, "hot_house");
      const priceValues = (item: FobItem) =>
        lanes.map((lane) => {
          const price = computeDelivered(item, freightByLane[lane]);
          return price === null ? "CALL" : formatMoney(price);
        });
      const blocks = [
        ...buildCategoryBlocks(westernGroups, priceValues),
        ...buildCategoryBlocks(hotHouseGroups, priceValues),
      ];
      const blob = await renderBrandedPriceSheetPng({
        subheaderText: "East Coast Delivered",
        priceColumns: lanes,
        subtitle: message,
        blocks,
        columns: 2,
      });
      const result = await copyOrDownloadPng(blob, "east-coast-delivered-pricing.png");
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
          <h1 className="text-2xl font-bold">East Coast Delivered Pricing</h1>
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
