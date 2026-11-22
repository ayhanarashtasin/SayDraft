import { NoteView } from "@/components/note/NoteView";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const noteId = Number(id);
  return <NoteView key={id} noteId={Number.isSafeInteger(noteId) && noteId > 0 ? noteId : 0} />;
}
