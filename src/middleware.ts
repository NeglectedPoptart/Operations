import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// api/agents/tick is called by the scheduler with no session (it checks
// its own secret), so it must skip the login redirect. api/carrier-rates is the
// "I've submitted my rates" page a carrier opens from the weekly rate email - it
// is protected by a signed token in the link instead.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/|logo-hbi-2025|api/agents/tick|api/carrier-rates).*)"],
  runtime: "nodejs",
};
