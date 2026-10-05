import { redirect } from "next/navigation";

// Pending to Invoice moved to the Accounting tab - kept so old bookmarks and
// notification links still land on it.
export default function MovedPendingToInvoicePage() {
  redirect("/accounting/pending-to-invoice");
}
