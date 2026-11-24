/**
 * Opacity-only route entrance wrapper.
 * Keeping the template root transform-free ensures fixed floating docks and
 * sticky headers never create a temporary containing block or jump on mount.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="view-enter">{children}</div>;
}
