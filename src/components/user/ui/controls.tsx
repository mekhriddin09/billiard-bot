"use client";

import { motion } from "framer-motion";

/**
 * Mijoz Mini App uchun yagona tugma. Soya FAQAT harakatga chaqiruvchi
 * (primary) va tanlangan holatlarga beriladi — soya "bosiladi" degan signal.
 */
export function Btn({
  children,
  onClick,
  variant = "outline",
  className = "",
  disabled = false,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "danger" | "ghost";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground shadow-cta hover:bg-primary-hover",
    outline: "border border-edge bg-card text-foreground hover:bg-surfaceMuted",
    danger: "border border-destructive/25 bg-destructive/10 text-destructive font-extrabold hover:bg-destructive/15",
    ghost: "text-surfaceMuted-foreground hover:text-foreground",
  }[variant];
  return (
    <motion.button
      type={type}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      onClick={disabled ? undefined : onClick}
      className={`rounded-control px-4 py-3.5 text-[14px] font-bold transition-colors ${styles} ${
        disabled ? "pointer-events-none opacity-40" : ""
      } ${className}`}
    >
      {children}
    </motion.button>
  );
}

/** Standart karta: chegarali, soyasiz. */
export function Card({
  children,
  className = "",
  as: As = "div",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  as?: any;
  onClick?: () => void;
}) {
  return (
    <As
      onClick={onClick}
      className={`rounded-card border border-edge bg-card text-card-foreground ${className}`}
    >
      {children}
    </As>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2.5 mt-6 flex items-center gap-2">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-foreground/80">
        {children}
      </span>
      {hint && <span className="text-[11px] text-surfaceMuted-foreground">{hint}</span>}
    </div>
  );
}

/** BookingSheet ichidagi tanlov guruhi elementi — doira belgisi + nom + narx. */
export function RadioCard({
  label,
  price,
  selected,
  badge,
  onClick,
}: {
  label: string;
  price?: string;
  selected: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-control border px-3.5 py-3 text-left transition-colors ${
        selected ? "border-primary bg-primary/[0.06]" : "border-edge bg-card"
      }`}
    >
      <span
        className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-primary" : "border-edge"
        }`}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-bold text-foreground">{label}</span>
          {badge && (
            <span className="shrink-0 rounded-pill bg-warning/15 px-1.5 py-0.5 text-[9.5px] font-bold text-warning">
              {badge}
            </span>
          )}
        </span>
      </span>
      {price && <span className="shrink-0 text-[13.5px] font-extrabold text-foreground">{price}</span>}
    </button>
  );
}
