import { createClient } from "@/lib/supabase/server";
import type { WorkflowTask } from "@/lib/types";
import WorkflowClient from "./WorkflowClient";

export const dynamic = "force-dynamic";

export default async function WorkflowPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("workflow_tasks")
    .select("*")
    .order("section", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load Workflow: {error.message}</p>;
  }

  return <WorkflowClient initialTasks={(data ?? []) as WorkflowTask[]} />;
}
