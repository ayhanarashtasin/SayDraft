/** Minimal Saydraft water-droplet 'S' brand mark (inherits text color via currentColor). */
export function BrandLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="16 6 68 88" fill="none" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M50 10 L73.71 45.97 A28.4 28.4 0 1 1 26.29 45.97 Z M50 20.99 L68.66 49.30 A22.35 22.35 0 0 1 69.04 73.30 C69.5 64.5 62.2 57.5 53.5 52.2 C42.5 46.5 38.0 39.8 42.2 32.8 Z M34.8 44.0 C35.4 49.6 41.2 54.4 50.3 59.0 C60.0 64.1 63.6 70.6 61.5 76.2 C59.8 80.8 55.6 83.95 50.0 83.95 A22.35 22.35 0 0 1 31.34 49.30 Z"
      />
    </svg>
  );
}
