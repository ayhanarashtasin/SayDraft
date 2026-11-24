export default function UploadLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas)]">
      <p role="status" className="sr-only">Opening audio upload…</p>
      <div aria-hidden="true" className="flex flex-1 flex-col">
        <div className="flex h-[3.875rem] items-center border-b border-[var(--border)]/70 px-5">
          <div className="h-9 w-9 rounded-full bg-[var(--surface-subtle)]" />
        </div>
        <div className="flex flex-1 p-6 sm:p-12">
          <div className="flex flex-1 items-center justify-center rounded-[1.25rem] border border-dashed border-[var(--border)]">
            <div className="h-5 w-52 max-w-[70%] rounded bg-[var(--surface-subtle)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
