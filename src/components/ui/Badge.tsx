// Single pill-badge implementation — replaces the STATUS_BADGE / CHIP_COLOR
// maps that were duplicated ad-hoc across admin pages.

export type BadgeTone = "green" | "red" | "gold" | "blue" | "purple" | "muted";

const TONE: Record<BadgeTone, string> = {
  green: "bg-success/12 text-success",
  red: "bg-destructive/12 text-destructive",
  gold: "bg-warning/14 text-warning",
  blue: "bg-primary/12 text-primary",
  purple: "bg-violet-400/14 text-violet-300",
  muted: "bg-foreground/[0.06] text-surfaceMuted-foreground",
};

export default function Badge({
  children,
  tone = "muted",
  dot = false,
  className = "",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  const dotColor = {
    green: "bg-success",
    red: "bg-destructive",
    gold: "bg-warning",
    blue: "bg-primary",
    purple: "bg-violet-400",
    muted: "bg-surfaceMuted-foreground",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE[tone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />}
      {children}
    </span>
  );
}
