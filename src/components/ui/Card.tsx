// The one card shell every panel uses — consistent radius, elevation and
// padding instead of each page inventing its own border/bg combination.

export function Card({
  children,
  className = "",
  padding = "md",
  interactive = false,
  as: As = "div",
}: {
  children: React.ReactNode;
  className?: string;
  padding?: "md" | "sm" | "none";
  interactive?: boolean;
  as?: "div" | "button";
}) {
  const pad = { md: "p-4", sm: "px-3.5 py-3", none: "" }[padding];
  return (
    <As
      className={`rounded-card border border-edge bg-card ${pad} ${
        interactive ? "text-left transition-colors hover:border-edgeStrong hover:bg-cardElevated" : ""
      } ${className}`}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number | string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/80">
          {title}
        </h2>
        {count !== undefined && <span className="text-[11px] text-surfaceMuted-foreground">({count})</span>}
      </div>
      {action}
    </div>
  );
}
