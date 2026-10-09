// Stand-in until the entry detail lands (WP6b): same props, so the list can
// already open it in a pane or a sheet.
export function EntryDetail({
  entryId,
}: {
  entryId: string;
  onClose: () => void;
}) {
  return <p className="px-3 py-2 text-small text-text-muted">{entryId}</p>;
}
