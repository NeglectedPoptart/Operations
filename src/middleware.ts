import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// api/agents/tick is called by the scheduler with no session (it checks
// its own secret), so it must skip the login redirect.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/|api/agents/tick).*)"],
  runtime: "nodejs",
};
