// US: (xxx) xxx-xxxx. Mexico (used for the Guadalajara, MX office): xx xxxx xxxx.
// Formats progressively so it can be called on every keystroke (live, as
// you type) as well as on blur - a partial digit count still produces a
// sensible in-progress shape (e.g. "(831" or "33 12") instead of raw digits.
export function formatPhoneNumber(raw: string, isMexico: boolean): string {
  let digits = raw.replace(/\D/g, "");

  if (isMexico) {
    if (digits.length > 10 && digits.startsWith("52")) digits = digits.slice(2);
  } else if (digits.length > 10 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);

  if (isMexico) {
    if (digits.length === 0) return "";
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6, 10)}`;
  }

  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}
