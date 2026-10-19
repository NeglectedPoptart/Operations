export interface UserNote {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  updated_at: string;
}

// Pinned notes first, then the most recently changed.
export function sortNotes(notes: UserNote[]): UserNote[] {
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
}

export function noteLabel(n: UserNote): string {
  const title = n.title.trim();
  if (title) return title;
  const firstLine = n.body.trim().split("\n")[0]?.trim();
  return firstLine ? firstLine.slice(0, 40) : "Untitled note";
}
