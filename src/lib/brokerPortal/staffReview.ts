import type { SupabaseClient } from "@supabase/supabase-js";

// What carriers have sent that staff still have to look at: PODs waiting to be marked Delivered and
// charges waiting for approval. Each part is read on its own and never throws, so the List page still
// loads if the portal migration (163) has not been run yet.

export interface SubmissionFile {
  name: string;
  url: string | null;
}

export interface PodSubmission {
  loadId: string;
  submittedAt: string;
  files: SubmissionFile[];
}

export interface ChargeSubmission {
  id: string;
  loadId: string;
  kind: string;
  amount: number;
  note: string | null;
  submittedBy: string | null;
  submittedAt: string;
  files: SubmissionFile[];
}

export interface Submissions {
  pods: PodSubmission[];
  charges: ChargeSubmission[];
}

export async function loadSubmissions(supabase: SupabaseClient): Promise<Submissions> {
  const empty: Submissions = { pods: [], charges: [] };
  try {
    const [podRes, chargeRes] = await Promise.all([
      supabase.from("load_documents").select("*").eq("kind", "pod").eq("review_status", "pending").order("created_at", { ascending: true }),
      supabase.from("broker_charge_requests").select("*").eq("status", "pending").order("submitted_at", { ascending: true }),
    ]);
    if (podRes.error || chargeRes.error) return empty;
    const chargeIds = (chargeRes.data ?? []).map((c) => c.id as string);
    const supportRes = chargeIds.length > 0 ? await supabase.from("load_documents").select("*").in("charge_request_id", chargeIds) : { data: [] };

    const docs = [...(podRes.data ?? []), ...(supportRes.data ?? [])];
    const urlByPath = new Map<string, string>();
    if (docs.length > 0) {
      const { data: signed } = await supabase.storage.from("load-documents").createSignedUrls(
        docs.map((d) => d.storage_path as string),
        3600,
      );
      for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }
    const file = (d: { file_name: unknown; storage_path: unknown }): SubmissionFile => ({ name: d.file_name as string, url: urlByPath.get(d.storage_path as string) ?? null });

    const podsByLoad = new Map<string, PodSubmission>();
    for (const d of podRes.data ?? []) {
      const id = d.load_id as string;
      const cur = podsByLoad.get(id) ?? { loadId: id, submittedAt: d.created_at as string, files: [] };
      cur.files.push(file(d));
      podsByLoad.set(id, cur);
    }
    return {
      pods: [...podsByLoad.values()],
      charges: (chargeRes.data ?? []).map((c) => ({
        id: c.id as string,
        loadId: c.load_id as string,
        kind: c.kind as string,
        amount: Number(c.amount),
        note: (c.note as string | null) ?? null,
        submittedBy: (c.submitted_by as string | null) ?? null,
        submittedAt: c.submitted_at as string,
        files: (supportRes.data ?? []).filter((d) => d.charge_request_id === c.id).map(file),
      })),
    };
  } catch {
    return empty;
  }
}
