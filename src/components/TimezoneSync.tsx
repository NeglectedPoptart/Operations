"use client";

import { useEffect } from "react";
import { reportTimezone } from "@/app/timezoneActions";

// Quietly tells the server which time zone this browser/phone is in, so the
// Activity Log can show people's own local time. Only calls the server when
// it differs from what's already saved (and the server ignores it for anyone
// whose zone was set by hand).
export default function TimezoneSync({ saved, manual }: { saved: string | null; manual: boolean }) {
  useEffect(() => {
    if (manual) return;
    let detected: string | undefined;
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (detected && detected !== saved) void reportTimezone(detected);
  }, [saved, manual]);
  return null;
}
