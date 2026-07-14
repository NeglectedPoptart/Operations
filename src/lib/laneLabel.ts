// Shared by both load-saving (lane auto-creation) and rate stats (matching
// booked loads back to a lane), so a load and its auto-created lane always
// agree on the label - see the "Route <-> Lane matching" design note.

interface StopDestination {
  destination_city: string | null;
  destination_state: string | null;
  position: number;
}

// Groups drops going to the same city/state together (e.g. two drops to
// "Houston, TX" become "Houston, TX (2 Drop)" instead of repeating the city)
// and only lists genuinely different cities side by side, joined with " & ".
export function destinationLabel(stops: StopDestination[]): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);

  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const s of sorted) {
    const label = [s.destination_city?.trim(), s.destination_state?.trim()].filter(Boolean).join(", ");
    if (!label) continue;
    if (!counts.has(label)) order.push(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return order
    .map((label) => {
      const count = counts.get(label) ?? 1;
      return count > 1 ? `${label} (${count} Drop)` : label;
    })
    .join(" & ");
}

export function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}
