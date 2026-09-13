import { fmtMoney } from "@/lib/format";

const SIZE = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-2xl",
} as const;

/**
 * Yagona narx ko'rsatish komponenti — butun ilova bo'ylab shu ishlatiladi.
 * Format (minglik ajratkich + "so'm") faqat shu yerda belgilanadi.
 */
export default function PriceTag({
  amount,
  size = "base",
  className = "",
  tone = "foreground",
}: {
  amount: number;
  size?: keyof typeof SIZE;
  className?: string;
  tone?: "foreground" | "primary" | "muted" | "onPrimary";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "muted"
        ? "text-surfaceMuted-foreground"
        : tone === "onPrimary"
          ? "text-primary-foreground"
          : "text-foreground";
  return (
    <span className={`font-extrabold tabular-nums ${SIZE[size]} ${toneClass} ${className}`}>
      {fmtMoney(amount)} <span className="font-extrabold">so&#39;m</span>
    </span>
  );
}
