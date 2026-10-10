type GroupHeaderProps = {
  title: string;
  subtitle: string;
  online?: boolean;
  typing?: boolean;
};

export default function GroupHeader({ title, subtitle, online, typing = false }: GroupHeaderProps) {
  return (
    <div className="chat-heading">
      <strong dir="auto">{title}</strong>
      <span dir="auto" className={[typing ? 'typing' : '', online ? 'online' : ''].filter(Boolean).join(' ') || undefined}>{subtitle}</span>
    </div>
  );
}
