"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatDate, formatTimestamp } from "@/lib/dates";
import {
  AP_PAY_LIST_ITEM_STATUSES,
  type ApPayList,
  type ApPayListItem,
  type ApPayListItemStatus,
  type Profile,
} from "@/lib/types";
import { deleteApPayList, deleteApPayListItem, updateApPayListItem } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

const STATUS_ROW_CLASS: Record<ApPayListItemStatus, string> = {
  pending: "",
  good_to_pay: "bg-green-50 dark:bg-green-950/20",
  hold: "bg-red-50 dark:bg-red-950/20",
};

export default function PayListsClient({
  payLists: initialPayLists,
  initialItems,
  profiles,
}: {
  payLists: ApPayList[];
  initialItems: ApPayListItem[];
  profiles: Profile[];
}) {
  const confirm = useConfirm();
  const [payLists, setPayLists] = useState(initialPayLists);
  const [items, setItems] = useState(initialItems);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const itemsByList = useMemo(() => {
    const map = new Map<string, ApPayListItem[]>();
    for (const item of items) {
      if (!map.has(item.pay_list_id)) map.set(item.pay_list_id, []);
      map.get(item.pay_list_id)!.push(item);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [items]);

  function handleFieldSave(id: string, patch: Partial<Pick<ApPayListItem, "status" | "notes">>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    updateApPayListItem(id, patch).catch(() => {});
  }

  async function handleDeleteItem(id: string) {
    if (!(await confirm("Remove this item from the pay list?"))) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deleteApPayListItem(id).catch(() => {});
  }

  async function handleClearList(list: ApPayList) {
    if (!(await confirm(`Clear the entire "${list.title}" pay list? This can't be undone.`))) return;
    setPayLists((prev) => prev.filter((l) => l.id !== list.id));
    setItems((prev) => prev.filter((i) => i.pay_list_id !== list.id));
    await deleteApPayList(list.id).catch(() => {});
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen lg:mx-[calc(7.5rem-50vw)] lg:w-[calc(100vw-15rem)] px-4 sm:px-8">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Pay Lists</h1>

        {payLists.length === 0 && (
          <p className="rounded-lg border border-black/10 p-4 text-center text-sm text-black/40 dark:border-white/10 dark:text-white/40">
            No pay lists yet - build one from the Accounts Payable page (check off payables into a pay list, then
            submit).
          </p>
        )}

        <div className="space-y-4">
          {payLists.map((list) => {
            const listItems = itemsByList.get(list.id) ?? [];
            const total = listItems.reduce((sum, i) => sum + i.balance, 0);
            const goodToPayTotal = listItems.filter((i) => i.status === "good_to_pay").reduce((sum, i) => sum + i.balance, 0);
            const holdTotal = listItems.filter((i) => i.status === "hold").reduce((sum, i) => sum + i.balance, 0);
            const creator = list.created_by ? profileById.get(list.created_by) : null;
            return (
              <div key={list.id} className="space-y-2 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{list.title}</h2>
                    <p className="text-xs text-black/40 dark:text-white/40">
                      Submitted {formatTimestamp(list.created_at)}
                      {creator?.email ? ` by ${creator.email}` : ""} - {listItems.length} item
                      {listItems.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-lg font-bold">{formatMoney(total)}</p>
                    <div className="flex gap-1">
                      {goodToPayTotal > 0 && (
                        <span className="whitespace-nowrap rounded bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300">
                          Good to Pay {formatMoney(goodToPayTotal)}
                        </span>
                      )}
                      {holdTotal > 0 && (
                        <span className="whitespace-nowrap rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-300">
                          HOLD {formatMoney(holdTotal)}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleClearList(list)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Clear List
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-black/5 text-left dark:bg-white/5">
                      <tr>
                        <th className="px-2 py-2">Vendor</th>
                        <th className="px-2 py-2">Document</th>
                        <th className="px-2 py-2">Date</th>
                        <th className="px-2 py-2">Concept</th>
                        <th className="px-2 py-2">GL Account</th>
                        <th className="px-2 py-2 text-right">Balance</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Notes</th>
                        <th className="w-16 px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {listItems.map((item) => (
                        <tr key={item.id} className={`border-t border-black/10 dark:border-white/10 ${STATUS_ROW_CLASS[item.status]}`}>
                          <td className="px-2 py-1.5">
                            <div className="font-medium">{item.vendor_name}</div>
                            <div className="text-xs text-black/40 dark:text-white/40">{item.vendor_code}</div>
                          </td>
                          <td className="px-2 py-1.5">{item.document}</td>
                          <td className="px-2 py-1.5">{item.doc_date ? formatDate(item.doc_date) : ""}</td>
                          <td className="px-2 py-1.5">{item.concept ?? ""}</td>
                          <td className="px-2 py-1.5">{item.gl_account_label}</td>
                          <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatMoney(item.balance)}</td>
                          <td className="min-w-[9rem] px-1 py-1">
                            <select
                              value={item.status}
                              onChange={(e) => handleFieldSave(item.id, { status: e.target.value as ApPayListItemStatus })}
                              className={field}
                            >
                              {AP_PAY_LIST_ITEM_STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="min-w-[10rem] px-1 py-1">
                            <input
                              defaultValue={item.notes ?? ""}
                              onBlur={(e) => handleFieldSave(item.id, { notes: e.target.value })}
                              className={field}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="text-xs font-medium text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
