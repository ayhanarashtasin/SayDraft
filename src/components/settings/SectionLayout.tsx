export function SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">{title}</h1>
        {description && <p className="mt-1 max-w-xl text-sm text-[var(--ink-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionCard({ title, description, children }: { title?: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface-card rounded-3xl p-5 sm:p-6">
      {title && <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2>}
      {description && <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{description}</p>}
      <div className={title || description ? "mt-4" : ""}>{children}</div>
    </section>
  );
}
