type GroupHeaderProps = {
  title: string;
  subtitle: string;
  online?: boolean;
};

export default function GroupHeader({ title, subtitle, online }: GroupHeaderProps) {
  return (
    <div className="chat-heading">
      <strong dir="auto">{title}</strong>
      <span dir="auto" className={online ? 'online' : undefined}>{subtitle}</span>
    </div>
  );
}
