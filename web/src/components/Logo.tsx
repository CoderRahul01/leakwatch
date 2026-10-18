// The mark: a drop held inside an open eye, on a signal-blue tile. Works down to 16 px.

export function LogoMark({ size = 32, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={animated ? 'logo-anim' : undefined}>
      <rect width="64" height="64" rx="18" fill="var(--signal)" />
      <rect width="64" height="64" rx="18" fill="url(#lw-sheen)" />
      <defs>
        <linearGradient id="lw-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="logo-lid" d="M8 32c6.5-10 14.6-15 24-15s17.5 5 24 15c-6.5 10-14.6 15-24 15S14.5 42 8 32z" fill="none" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
      <path className="logo-drop" d="M32 21c4.8 6 7.2 10.4 7.2 13.4a7.2 7.2 0 0 1-14.4 0C24.8 31.4 27.2 27 32 21z" fill="#fff" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">Leakwatch</span>
    </span>
  );
}
