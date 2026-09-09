"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { SrSoStatus } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/shipping-receiving/order-entry");
  revalidatePath("/shipping-receiving/shipping");
}

// Customers -------------------------------------------------------------------

export async function createCustomer(name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sr_customers").insert({ name }).select().single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateCustomer(
  id: string,
  patch: { name?: string; contact_name?: string | null; phone?: string | null; email?: string | null; terms?: string | null; notes?: string | null },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_customers").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteCustomer(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_customers").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Sales Orders ------------------------------------------------------------------

export async function createSalesOrder(orderNumber: string, customerId: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sr_sales_orders")
    .insert({ order_number: orderNumber, customer_id: customerId, order_date: todayISO() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateSalesOrder(
  id: string,
  patch: { order_number?: string; customer_id?: string | null; order_date?: string | null; ship_date?: string | null; status?: SrSoStatus; notes?: string | null },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_sales_orders").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteSalesOrder(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_sales_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function addSoLine(soId: string, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sr_so_lines")
    .insert({ so_id: soId, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateSoLine(id: string, patch: { item_id?: string | null; qty_ordered?: number | null; unit_price?: number | null }) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_so_lines").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteSoLine(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_so_lines").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
