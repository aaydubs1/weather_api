/** Small italic "i" info icon with a hover/focus tooltip bubble. Reused across the UI. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="infotip" tabIndex={0} aria-label={text}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle className="infotip-circle" cx="8" cy="8" r="7.5" fill="#94a3b8" />
        <circle className="infotip-glyph" cx="8" cy="4.6" r="1" fill="#fff" />
        <rect className="infotip-glyph" x="7.15" y="6.7" width="1.7" height="5" rx="0.85" fill="#fff" />
      </svg>
      <span className="infotip-bubble">{text}</span>
    </span>
  );
}
