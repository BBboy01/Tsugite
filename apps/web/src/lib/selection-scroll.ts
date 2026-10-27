export function keepSelectionVisible(
  list: HTMLElement | null,
  selected: HTMLElement | null,
  hasPrevious: boolean,
  hasNext: boolean,
): void {
  if (!list || !selected) return;
  const selectedBounds = selected.getBoundingClientRect();
  const listBounds = list.getBoundingClientRect();
  const rowHeight = selectedBounds.height;
  if (rowHeight <= 0) return;

  const topInset = hasPrevious ? rowHeight : 0;
  const bottomInset = hasNext ? rowHeight : 0;
  const top = listBounds.top + topInset;
  const bottom = listBounds.bottom - bottomInset;
  if (selectedBounds.top < top) {
    list.scrollTop += selectedBounds.top - top;
  } else if (selectedBounds.bottom > bottom) {
    list.scrollTop += selectedBounds.bottom - bottom;
  }
}
