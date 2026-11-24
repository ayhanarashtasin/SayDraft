import React from "react";

interface IconProps {
  className?: string;
}

export function SortArrowsIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M8 6v12" />
      <path d="M4.5 9.5 8 6l3.5 3.5" />
      <path d="M16 18V6" />
      <path d="m12.5 14.5 3.5 3.5 3.5-3.5" />
    </svg>
  );
}

/** Solid rounded hexagon with centered cutout circle (Letterly Settings icon). */
export function HexSettingsIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.2 3.35a3.6 3.6 0 0 1 3.6 0l6.25 3.61a3.6 3.6 0 0 1 1.8 3.12v7.22a3.6 3.6 0 0 1-1.8 3.12l-6.25 3.61a3.6 3.6 0 0 1-3.6 0l-6.25-3.61a3.6 3.6 0 0 1-1.8-3.12v-7.22a3.6 3.6 0 0 1 1.8-3.12l6.25-3.61ZM14 10.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PencilSolidIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M16.86 3.49a2.25 2.25 0 0 1 3.18 3.18l-1.08 1.08-3.18-3.18 1.08-1.08Zm-2.14 2.14L4.7 15.65a2 2 0 0 0-.52.94l-.9 3.61a.75.75 0 0 0 .91.91l3.61-.9a2 2 0 0 0 .94-.52L17.9 9.75l-3.18-4.12Z" />
    </svg>
  );
}

export function PlusThinIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SearchLoopIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={className}>
      <circle cx="10.75" cy="10.75" r="6.25" />
      <path d="m15.5 15.5 4.25 4.25" />
    </svg>
  );
}

export function WriteNoteLinesIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M4.5 7h15" />
      <path d="M4.5 11.5h15" />
      <path d="M4.5 16h11.5" />
      <path d="M4.5 20.5h7" />
    </svg>
  );
}

export function PaperclipClipIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="m18.36 11.64-7.07 7.07a5 5 0 0 1-7.07-7.07l7.78-7.78a3.33 3.33 0 0 1 4.71 4.71l-7.78 7.78a1.67 1.67 0 0 1-2.36-2.36l7.07-7.07" />
    </svg>
  );
}

export function MeetingWaveIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="3" y="4.5" width="18" height="12.5" rx="3" />
      <path d="M8 10.75v-2m4 3.5v-5m4 3.5v-2M8.5 20h7" />
    </svg>
  );
}

export function HashThickIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M5 9.25h14M5 14.75h14M10.25 4.5l-2 15M15.75 4.5l-2 15" />
    </svg>
  );
}

export function MergeDocsIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="4" y="4" width="11" height="13" rx="2.5" />
      <path d="M9 17.5V19a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
      <path d="M12.5 11.5h4.5m-2.25-2.25v4.5" />
    </svg>
  );
}

export function TrashCoralIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" />
      <path d="M6.75 7l.9 11.5a2 2 0 0 0 2 1.85h4.7a2 2 0 0 0 2-1.85L17.25 7" />
      <path d="M10.25 11.25v5m3.5-5v5" />
    </svg>
  );
}

export function CheckCircleFilledIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" />
      <path d="m8.5 12.2 2.4 2.4 4.8-5" stroke="var(--cta-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronCircleRightIcon({ className = "h-5 w-5", arrowStroke = "var(--surface-panel)" }: IconProps & { arrowStroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" />
      <path d="m10.75 8.75 3.5 3.25-3.5 3.25" stroke={arrowStroke} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BackArrowIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

export function PlayTriangleIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M6.25 4.4c0-.85.94-1.36 1.66-.9l9.1 5.6a1.05 1.05 0 0 1 0 1.8l-9.1 5.6c-.72.44-1.66-.07-1.66-.9V4.4Z" />
    </svg>
  );
}

export function PauseBarsIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <rect x="6.5" y="5" width="4" height="14" rx="1.6" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.6" />
    </svg>
  );
}

export function SkipBack15Icon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" className={className}>
      <path d="M9.4 7.7A8.75 8.75 0 1 1 5.25 15.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M11.6 4.7 8.4 7.7l3.2 2.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <text x="14" y="17.8" textAnchor="middle" fill="currentColor" fontSize="8.5" fontWeight="700" fontFamily="inherit">
        15
      </text>
    </svg>
  );
}

export function SkipForward15Icon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" className={className}>
      <path d="M18.6 7.7A8.75 8.75 0 1 0 22.75 15.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="m16.4 4.7 3.2 3-3.2 2.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <text x="14" y="17.8" textAnchor="middle" fill="currentColor" fontSize="8.5" fontWeight="700" fontFamily="inherit">
        15
      </text>
    </svg>
  );
}

export function CopySquaresIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="8" y="8" width="11" height="11" rx="3" />
      <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
    </svg>
  );
}

export function SparklesFilledIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M10.2 3.2c.35-1.1 1.9-1.1 2.25 0l1.1 3.45a2.5 2.5 0 0 0 1.63 1.63l3.45 1.1c1.1.35 1.1 1.9 0 2.25l-3.45 1.1a2.5 2.5 0 0 0-1.63 1.63l-1.1 3.45c-.35 1.1-1.9 1.1-2.25 0l-1.1-3.45a2.5 2.5 0 0 0-1.63-1.63l-3.45-1.1c-1.1-.35-1.1-1.9 0-2.25l3.45-1.1a2.5 2.5 0 0 0 1.63-1.63l1.1-3.45Z" />
      <path d="M18.2 15.2c.2-.62 1.08-.62 1.28 0l.48 1.5c.14.43.47.76.9.9l1.5.48c.62.2.62 1.08 0 1.28l-1.5.48c-.43.14-.76.47-.9.9l-.48 1.5c-.2.62-1.08.62-1.28 0l-.48-1.5a1.5 1.5 0 0 0-.9-.9l-1.5-.48c-.62-.2-.62-1.08 0-1.28l1.5-.48c.43-.14.76-.47.9-.9l.48-1.5Z" />
    </svg>
  );
}

export function TranslateDualIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M5 10.5A7.2 7.2 0 0 1 17.5 6.8M19 13.5a7.2 7.2 0 0 1-12.5 3.7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="m17.8 4.4.4 2.9-2.8-.6M6.2 19.6l-.4-2.9 2.8.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="6.5" y="7" width="6.2" height="6.2" rx="1.4" fill="currentColor" />
      <text x="9.6" y="11.7" textAnchor="middle" fill="var(--surface)" fontSize="4.9" fontWeight="700">文</text>
      <rect x="11.4" y="10.8" width="6.2" height="6.2" rx="1.4" fill="currentColor" />
      <text x="14.5" y="15.5" textAnchor="middle" fill="var(--surface)" fontSize="4.9" fontWeight="700">A</text>
    </svg>
  );
}

export function MoreDotsVerticalIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="12" cy="5.5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="18.5" r="1.75" />
    </svg>
  );
}

export function CurvedArrowDownIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M11 4c-1.5 3.8 1.5 6 4.8 7.5 2.5 1.1 2.2 4.6-.5 6.3-1.8 1.1-2.2 3.2-1.3 6.2" />
      <path d="m10.5 21.5 3.5 2.9 2.6-3.7" />
    </svg>
  );
}

export function BoltFilledIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M13.5 2.5 5.4 13.1c-.45.58-.03 1.4.7 1.4h4.75l-1.35 6.8c-.17.85.94 1.32 1.48.62l8.1-10.6c.45-.58.03-1.4-.7-1.4h-4.75l1.35-6.8c.17-.85-.94-1.32-1.48-.62Z" />
    </svg>
  );
}

export function BriefcaseGalleryIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M9 4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6h4a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5v-9A2.5 2.5 0 0 1 5 6h4V4.5Zm1.5 1.5h3V4.5h-3V6Z" />
    </svg>
  );
}

export function RestartLoopIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M4.75 11.5A7.25 7.25 0 1 1 6.9 17.1" />
      <path d="M4.2 7.5v4.3h4.3" />
    </svg>
  );
}

export function StopSquareRingIcon({ className = "h-14 w-14" }: IconProps) {
  return (
    <svg viewBox="0 0 56 56" fill="none" aria-hidden="true" className={className}>
      <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="2.2" />
      <rect x="17" y="17" width="22" height="22" rx="6" fill="#e75533" />
    </svg>
  );
}

export function RecordStartRingIcon({ className = "h-14 w-14" }: IconProps) {
  return (
    <svg viewBox="0 0 56 56" fill="none" aria-hidden="true" className={className}>
      <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="28" cy="28" r="16" fill="#e75533" />
    </svg>
  );
}

export function UploadTrayBoxIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <rect x="2.5" y="3.5" width="19" height="17" rx="4.5" fill="currentColor" />
      <path d="M12 8.25v7.5m0-7.5-3 3m3-3 3 3" stroke="var(--canvas)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Solid filled Note More-menu icons matching Letterly's 12-note-detail-more-menu.png. */
export function BookSolidIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 1 4 16.5v-11Zm9-2.5h4.5A2.5 2.5 0 0 1 20 5.5v11a2.5 2.5 0 0 1-2.5 2.5H13V3Z" />
    </svg>
  );
}

export function MicSolidIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <rect x="8.25" y="3" width="7.5" height="11.5" rx="3.75" />
      <path d="M6 11.5a1 1 0 1 0-2 0 8 8 0 0 0 7 7.94V21H8.75a1 1 0 1 0 0 2h6.5a1 1 0 1 0 0-2H13v-1.56a8 8 0 0 0 7-7.94 1 1 0 1 0-2 0 6 6 0 1 1-12 0Z" />
    </svg>
  );
}

export function ExportAudioSolidIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2h9A2.5 2.5 0 0 1 19 4.5v11a2.5 2.5 0 0 1-2.5 2.5H14v-3.2l1.15 1.15a1 1 0 1 0 1.4-1.42l-2.85-2.85a1 1 0 0 0-1.4 0l-2.85 2.85a1 1 0 1 0 1.4 1.42L12 14.8V18H7.5A2.5 2.5 0 0 1 5 15.5v-11Z" />
      <rect x="9.5" y="19.5" width="5" height="2" rx="1" />
    </svg>
  );
}

export function GlobeLangSolidIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" />
      <text x="12" y="15.4" textAnchor="middle" fill="var(--surface)" fontSize="10" fontWeight="700">文</text>
    </svg>
  );
}

export function SpeakersSolidIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <circle cx="7" cy="6.5" r="2.25" fill="currentColor" stroke="none" />
      <circle cx="17" cy="17.5" r="2.25" fill="currentColor" stroke="none" />
      <circle cx="7" cy="17.5" r="2.25" fill="currentColor" stroke="none" />
      <path d="M7 8.75v6.5M7 12c4.5 0 10 0 10 3.25" />
    </svg>
  );
}

export function ScissorsSolidIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <circle cx="6.5" cy="7.5" r="2.5" />
      <circle cx="6.5" cy="16.5" r="2.5" />
      <path d="M8.7 9.1 19 16.5M8.7 14.9 19 7.5" />
    </svg>
  );
}

export function ArchiveBoxSolidIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <rect x="3" y="4" width="18" height="4.5" rx="1.75" />
      <path d="M4.5 10h15v8a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 18v-8Zm5 3a1 1 0 1 0 0 2h5a1 1 0 1 0 0-2h-5Z" />
    </svg>
  );
}

export function TrashFilledIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M9.5 3.5A1.5 1.5 0 0 0 8 5v1H4.75a1 1 0 1 0 0 2h14.5a1 1 0 1 0 0-2H16V5a1.5 1.5 0 0 0-1.5-1.5h-5ZM6.2 9.5l.85 9.6A2.25 2.25 0 0 0 9.3 21h5.4a2.25 2.25 0 0 0 2.25-1.9l.85-9.6H6.2Zm4.55 2.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 .75-.75Zm2.5 0a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 .75-.75Z" />
    </svg>
  );
}

export function ArchiveBoxIllustration({ className = "h-24 w-24" }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true" className={className}>
      <circle cx="48" cy="48" r="46" fill="var(--surface)" />
      <rect x="24" y="25" width="48" height="14" rx="5" fill="#7c5cf6" />
      <rect x="27" y="36" width="42" height="35" rx="7" fill="#5b3aed" />
      <rect x="39" y="45" width="18" height="5" rx="2.5" fill="#fef8fb" />
    </svg>
  );
}

export function TagsIllustration({ className = "h-14 w-14" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <path d="M36 12 52 28c2 2 2 5 0 7L35 52c-2 2-5 2-7 0L12 36V18a6 6 0 0 1 6-6h18Z" fill="#7c5cf6" opacity="0.28" />
      <path d="M30 8 49 27c2 2 2 5.2 0 7.2L34.2 49c-2 2-5.2 2-7.2 0L8 30V13a5 5 0 0 1 5-5h17Z" fill="#5b3aed" />
      <circle cx="17.5" cy="17.5" r="3.2" fill="#fef8fb" />
    </svg>
  );
}

export function DictionaryIllustration({ className = "h-14 w-14" }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <rect x="13" y="10" width="34" height="44" rx="7" fill="#5b3aed" />
      <rect x="19" y="10" width="28" height="37" rx="5" fill="#7c5cf6" />
      <text x="33" y="34" textAnchor="middle" fill="#fef8fb" fontSize="13" fontWeight="800" fontFamily="inherit">
        ABC
      </text>
      <path d="M19 46h28v4a4 4 0 0 1-4 4H19v-8Z" fill="#fef8fb" opacity="0.9" />
    </svg>
  );
}

export function ScissorsIllustration({ className = "h-12 w-12" }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <circle cx="13" cy="15" r="5" />
      <circle cx="13" cy="33" r="5" />
      <path d="M17.2 18.2 38 33M17.2 29.8 38 15" />
    </svg>
  );
}

export function WebhookNodesIcon({ className = "h-12 w-12" }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={className}>
      <rect width="48" height="48" rx="14" fill="#5b3aed" />
      <path d="M24 14.5v5.5m0 0-6.5 11.5m6.5-11.5 6.5 11.5m-13 0h13" stroke="#fef8fb" strokeWidth="2.3" strokeLinecap="round" />
      <circle cx="24" cy="14" r="3" fill="#fef8fb" />
      <circle cx="17" cy="32" r="3" fill="#fef8fb" />
      <circle cx="31" cy="32" r="3" fill="#fef8fb" />
    </svg>
  );
}

export function NotionDocIcon({ className = "h-12 w-12" }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={className}>
      <rect width="48" height="48" rx="14" fill="#01050f" />
      <path d="M16 15h4.2l7.8 11.8V15H32v18h-4l-8-12.2V33H16V15Z" fill="#fef8fb" />
    </svg>
  );
}

/** Multi-color clean-room icon matched to each Rewrite preset & category. */
export function PromptIcon({
  builtinKey,
  templateId,
  category,
  className = "h-6 w-6",
}: {
  builtinKey?: string | null;
  templateId?: string | null;
  category?: string;
  className?: string;
}) {
  const key = (builtinKey || templateId || category || "general").toLowerCase();

  if (key.includes("magic")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <circle cx="9.5" cy="9.5" r="6" fill="#fde047" />
        <path d="M12.5 12.5 20 20" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" />
        <path d="m14.5 14.5 5.5 5.5" stroke="#c084fc" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="9.5" cy="9.5" r="2.2" fill="#f97316" />
        <path d="M17.5 5v3M16 6.5h3" stroke="#ec4899" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (key.includes("slight")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <path d="M19.5 4.5C13 5.2 8.8 9.2 7.5 15.5l-3 4 4-3c6.3-1.3 10.3-5.5 11-12Z" fill="#3b82f6" />
        <path d="M8 16c2.5-3 5.8-6.2 10.5-9.5" stroke="#e0f2fe" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (key.includes("signif")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <circle cx="10.5" cy="10.5" r="5.5" fill="#bae6fd" stroke="#0284c7" strokeWidth="2.2" />
        <path d="m14.7 14.7 5 5" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  if (key.includes("struct")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <path d="M12 7v4m0 0H6.5v4M12 11h5.5v4" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="9" y="3.5" width="6" height="4" rx="1.2" fill="#ec4899" />
        <rect x="4" y="15" width="5" height="4" rx="1.2" fill="#3b82f6" />
        <rect x="15" y="15" width="5" height="4" rx="1.2" fill="#22c55e" />
      </svg>
    );
  }
  if (key.includes("list")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <rect x="5" y="4" width="14" height="17" rx="3" fill="#bae6fd" stroke="#0ea5e9" strokeWidth="1.6" />
        <rect x="9" y="2.5" width="6" height="3" rx="1" fill="#0284c7" />
        <path d="M8.5 10h7M8.5 13.5h7M8.5 17h5" stroke="#0369a1" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (key.includes("meeting") || key.includes("work")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <rect x="4" y="5" width="16" height="11" rx="2" fill="#8b5cf6" />
        <path d="M8 13v-2m4 2V9m4 4v-3" stroke="#fef8fb" strokeWidth="1.8" strokeLinecap="round" />
        <path d="m12 16-3.5 4.5M12 16l3.5 4.5" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (key.includes("summary") || key.includes("short") || key.includes("detail")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <path d="M6.5 3.5h8l4 4v13a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5 20.5v-15A1.5 1.5 0 0 1 6.5 3.5Z" fill="#e9d5ff" stroke="#7c3aed" strokeWidth="1.5" />
        <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" stroke="#5b21b6" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (key.includes("email")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <rect x="3.5" y="5.5" width="17" height="13" rx="3" fill="#f97316" />
        <path d="m5.5 8 6.5 5 6.5-5" stroke="#fef8fb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (key.includes("journal") || key.includes("personal")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <rect x="5" y="3.5" width="14" height="17" rx="3" fill="#fbbf24" />
        <path d="M9 8.5h6M9 12h6M9 15.5h4" stroke="#78350f" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (key.includes("content") || key.includes("social") || key.includes("blog") || key.includes("writing")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <rect x="4" y="4" width="16" height="16" rx="4" fill="#ec4899" />
        <path d="M8 15.5 15.5 8M13 7.5h3.5V11" stroke="#fef8fb" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="8.5" fill="#6a5ad6" />
      <path d="M12 7.5v9M7.5 12h9" stroke="#fef8fb" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
