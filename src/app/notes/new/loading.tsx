export default function NewNoteLoading() {
  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <p role="status" className="sr-only">Opening the note editor…</p>
      <div aria-hidden="true">
        <div className="flex h-[3.875rem] items-center justify-between border-b border-[var(--border)]/70 px-5">
          <div className="h-9 w-9 rounded-full bg-[var(--surface-subtle)]" />
          <div className="h-8 w-24 rounded-full bg-[var(--surface-subtle)]" />
        </div>
        <div className="mx-auto max-w-[40.75rem] space-y-6 px-5 pt-8 sm:px-6 sm:pt-10">
          <div className="h-8 w-36 rounded-lg bg-[var(--surface-subtle)]" />
          <div className="h-5 max-w-64 rounded bg-[var(--surface-subtle)]" />
        </div>
      </div>
    </div>
  );
}
