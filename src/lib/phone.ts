// US: (xxx) xxx-xxxx. Mexico (used for the Guadalajara, MX office): xx xxxx xxxx.
// Leaves incomplete input (fewer than 10 local digits) alone so it doesn't
// fight the user mid-entry - formatting only snaps into place once a full
// number has been typed and the field is blurred.
export function formatPhoneNumber(raw: string, isMexico: boolean): string {
  let digits = raw.replace(/\D/g, "");

  if (isMexico) {
    if (digits.length === 12 && digits.startsWith("52")) digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10) return digits;

  return isMexico
    ? `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6, 10)}`
    : `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}
