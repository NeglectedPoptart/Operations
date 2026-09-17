import { createClient } from "@/lib/supabase/server";
import type { CompanyDocument, DocumentCategory } from "@/lib/types";
import DocumentsClient from "./DocumentsClient";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const supabase = await createClient();

  const [{ data: categories, error: categoriesError }, { data: documents, error: documentsError }] = await Promise.all([
    supabase.from("document_categories").select("*").order("position", { ascending: true }),
    supabase.from("company_documents").select("*").order("position", { ascending: true }),
  ]);

  const error = categoriesError ?? documentsError;
  if (error) {
    return <p className="text-red-600">Failed to load Documents: {error.message}</p>;
  }

  return (
    <DocumentsClient
      initialCategories={(categories ?? []) as DocumentCategory[]}
      initialDocuments={(documents ?? []) as CompanyDocument[]}
    />
  );
}
