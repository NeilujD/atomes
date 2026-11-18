// The "Not owned" mark (Q8): the shared chip `.chip-not-owned` of theme.css,
// green, with a check. To Buy and the Library (Grid, List, Cover flow).
export function NotOwnedChip({ label, class: extra }: { label: string; class?: string }) {
  return (
    <span class={extra ? `chip chip-not-owned ${extra}` : 'chip chip-not-owned'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      {label}
    </span>
  );
}
