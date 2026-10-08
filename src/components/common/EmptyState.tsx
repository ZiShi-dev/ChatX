type EmptyStateProps = {
  title: string;
  detail?: string;
};

export default function EmptyState({ title, detail }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
    </div>
  );
}
