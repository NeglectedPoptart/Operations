import { redirect } from "next/navigation";

// AR Troubles is gone - trouble-flagged invoices now show on the AR page with a Trouble badge.
export default function Moved() {
  redirect("/accounting/ar");
}
