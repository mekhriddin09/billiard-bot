export default function EmptyState({
  icon = "—",
  title,
  subtitle,
}: {
  icon?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-edge px-4 py-8 text-center">
      <span className="text-xl opacity-50">{icon}</span>
      <span className="text-sm font-medium text-foreground/60">{title}</span>
      {subtitle && <span className="text-xs text-surfaceMuted-foreground">{subtitle}</span>}
    </div>
  );
}
