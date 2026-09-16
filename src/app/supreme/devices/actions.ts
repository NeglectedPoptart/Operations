"use server";

import { createClient } from "@/lib/supabase/server";
import type { Device } from "@/lib/types";

// No revalidatePath in this file on purpose - see the equivalent note in
// employee-files/actions.ts. Revalidating on every reassignment click
// forces a page remount mid-interaction, which is exactly what caused
// real data loss there. The client's own optimistic setState already
// reflects each change instantly, the row is written correctly
// regardless, and both pages that read this table are force-dynamic so a
// later visit fetches fresh data anyway.

export async function createDevice(input: {
  deviceType: string | null;
  deviceTypeOther: string | null;
  deviceName: string | null;
  serialNumber: string | null;
  assignedTo: string | null;
}): Promise<Device> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("devices")
    .insert({
      device_type: input.deviceType,
      device_type_other: input.deviceTypeOther,
      device_name: input.deviceName,
      serial_number: input.serialNumber,
      assigned_to: input.assignedTo,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Device;
}

export async function updateDevice(
  id: string,
  patch: Partial<
    Pick<Device, "device_type" | "device_type_other" | "device_name" | "serial_number" | "assigned_to" | "notes">
  >,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("devices").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteDevice(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("devices").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
