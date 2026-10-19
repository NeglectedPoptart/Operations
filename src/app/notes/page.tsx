import NotesPad from "@/components/notes/NotesPad";

export const dynamic = "force-dynamic";

export const metadata = { title: "Notes" };

// The Notes pad as a page of its own - what the Pop out button opens in a separate browser window.
export default function NotesPage() {
  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-2">
      <h1 className="text-xl font-bold">Notes</h1>
      <div className="min-h-0 flex-1">
        <NotesPad />
      </div>
    </div>
  );
}
