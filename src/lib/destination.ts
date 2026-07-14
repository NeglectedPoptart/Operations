// Splits a "City, ST" combobox label into the two destination_cities/
// load_stops columns. Shared by the client form (StopsEditor) and the server
// action that persists a newly-added destination city.
export function splitDestinationLabel(label: string): { city: string; state: string } {
  const [city, state] = label.split(",").map((part) => part.trim());
  return { city: city ?? "", state: state ?? "" };
}

// Rejects a new Source/Destination combobox entry that doesn't include a
// state, so the locked lists can't drift back into bare-city duplicates
// (e.g. "PHARR" alongside "Pharr, TX").
export function validateCityStateLabel(label: string): string | null {
  const { city, state } = splitDestinationLabel(label);
  if (!city || !state) return 'Include a state, e.g. "City, ST"';
  return null;
}
