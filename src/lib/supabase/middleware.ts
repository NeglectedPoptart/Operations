import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { BROKER_CARRIER_PATH, canAccessTab, tabForPath, type Role } from "@/lib/roles";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  if (!user) {
    if (!pathname.startsWith("/login")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Every redirect below needs to know the role anyway (even the plain
  // "signed in, hitting /login" case - a broker_carrier lands on their one
  // page, not Home), so it's fetched once up front rather than only when a
  // tab-gated path is hit.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (profile?.role ?? null) as Role | null;
  const homePath = role === "broker_carrier" ? BROKER_CARRIER_PATH : "/";

  if (pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = homePath;
    return NextResponse.redirect(url);
  }

  // A broker/carrier login is a hardcoded exception to the whole tab
  // system - exactly this one page, not even Home, regardless of what
  // ROLE_TABS says (it has none). Checked before the generic tab logic so
  // it can never fall through to it.
  if (role === "broker_carrier") {
    if (pathname !== BROKER_CARRIER_PATH) {
      const url = request.nextUrl.clone();
      url.pathname = BROKER_CARRIER_PATH;
      return NextResponse.redirect(url);
    }
    return response;
  }

  const tab = tabForPath(pathname);
  if (tab && !canAccessTab(role, tab)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
