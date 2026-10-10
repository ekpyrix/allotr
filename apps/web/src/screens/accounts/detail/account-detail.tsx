// Stub: fork 07b replaces this with the real detail pane.
export function AccountDetail({
  accountId,
}: {
  accountId: string;
  onClose: () => void;
}) {
  return <p className="px-3 py-2 text-small">{accountId}</p>;
}
