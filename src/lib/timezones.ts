import { APP_TIMEZONE } from "./dates";

// Zones offered when setting a person's time zone by hand (User Roles). Auto
// detection can still record any zone - this list is just the quick picks.
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "America/Chicago", label: "Central - Texas (Chicago)" },
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (no daylight saving)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Mexico_City", label: "Mexico City" },
  { value: "America/Monterrey", label: "Monterrey" },
  { value: "America/Hermosillo", label: "Sonora (Hermosillo)" },
  { value: "America/Tijuana", label: "Tijuana" },
  { value: "America/Bogota", label: "Bogota" },
  { value: "America/Lima", label: "Lima" },
  { value: "America/Sao_Paulo", label: "Sao Paulo" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Madrid", label: "Madrid" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Karachi", label: "Karachi" },
  { value: "Asia/Kolkata", label: "India (Kolkata)" },
  { value: "Asia/Manila", label: "Manila" },
  { value: "Asia/Shanghai", label: "China (Shanghai)" },
  { value: "Australia/Sydney", label: "Sydney" },
];

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function timeZoneLabel(tz: string): string {
  return TIMEZONE_OPTIONS.find((o) => o.value === tz)?.label ?? tz.replace(/_/g, " ");
}

export function isAppTimeZone(tz: string | null | undefined): boolean {
  return tz === APP_TIMEZONE;
}

// "Oct 7, 2026, 9:39 AM CDT" - a moment shown on the clock of the given zone,
// with that zone's own abbreviation (CDT/CST, EDT, GMT-5...).
export function formatTimestampIn(ts: string | null, timeZone: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  const date = d.toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `${date}, ${time}`;
}
