// How a customer name is matched between a load's stop (client_name) and the Customer Emails
// list: lower-case, letters and numbers only - so "WinCo Foods, LLC" and "Winco Foods LLC" match.
export function customerKey(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
