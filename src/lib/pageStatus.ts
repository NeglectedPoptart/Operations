// FOB Pharr and the three Delivered sheets all derive from the same
// fob_items/fob_freight_rates data - confirming any one of them as up to
// date means all four are, so each page's UpdateStatusButton lists the
// other three as linkedKeys and they all mark together.
export const FOB_FAMILY_KEYS = ["fob-pharr", "delivered-houston", "delivered-dallas", "delivered-east-coast"];

export function fobFamilyLinkedKeys(pageKey: string): string[] {
  return FOB_FAMILY_KEYS.filter((k) => k !== pageKey);
}
