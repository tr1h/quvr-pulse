/** Logo mark: a single heartbeat trace inside a bezel. */
export function PulseMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="0.5" y="0.5" width="31" height="31" rx="4" fill="none" stroke="var(--color-rule)" />
      <path
        d="M3 17h7l2.5-7 4 13 3-9 2 3h7.5"
        fill="none"
        stroke="var(--color-signal)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="trace"
      />
    </svg>
  );
}
