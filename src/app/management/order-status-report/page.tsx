import { redirect } from "next/navigation";

// Moved to SubManagement.
export default function Moved() {
  redirect("/submanagement/order-status-report");
}
