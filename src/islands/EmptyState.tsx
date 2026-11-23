// The screen of an empty list (UI direction, "Empty list"): one card in the
// middle, what the list will show, and the way to a first book. A link, so it
// works before the scripts run. Home, Library and To Buy use it.
export function EmptyState({ text, action, href }: { text: string; action: string; href: string }) {
  return (
    <div class="card empty-state">
      <p>{text}</p>
      <a class="button button-main" href={href}>
        {action}
      </a>
    </div>
  );
}
