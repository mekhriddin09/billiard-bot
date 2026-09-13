"use client";

import { motion } from "framer-motion";
import type { TableStatus } from "@/lib/types";

export const STATUS_META: Record<
  TableStatus,
  { label: string; dot: string; text: string }
> = {
  free: { label: "Bo'sh", dot: "bg-success", text: "text-success" },
  active: { label: "O'yinda", dot: "bg-destructive", text: "text-destructive" },
  reserved: { label: "Saqlangan", dot: "bg-warning", text: "text-warning" },
  off: { label: "O'chirilgan", dot: "bg-surfaceMuted-foreground", text: "text-surfaceMuted-foreground" },
};

export function StatusDot({ status, pulse = false }: { status: TableStatus; pulse?: boolean }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${m.dot} ${pulse && status === "active" ? "animate-pulseDot" : ""}`}
      />
      <span className={`text-[11px] font-medium ${m.text}`}>{m.label}</span>
    </span>
  );
}

export function Btn({
  children,
  onClick,
  variant = "ghost",
  className = "",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "danger" | "gold" | "ghost";
  className?: string;
  disabled?: boolean;
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground shadow-cta hover:bg-primary-hover",
    danger: "bg-destructive text-white border border-destructive/50 hover:bg-destructive/85 font-bold",
    // "gold" — tarixiy nom, vizual jihatdan primary bilan bir xil (asosiy CTA rangi doim ko'k).
    gold: "bg-primary text-primary-foreground shadow-cta hover:bg-primary-hover",
    ghost: "bg-card text-foreground border border-edge hover:bg-cardElevated",
  }[variant];
  return (
    <motion.button
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      onClick={disabled ? undefined : onClick}
      className={`rounded-control px-4 py-3 text-[13px] font-semibold tracking-wide transition-colors ${styles} ${disabled ? "opacity-40" : ""} ${className}`}
    >
      {children}
    </motion.button>
  );
}

export function Row({
  label,
  value,
  accent = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-surfaceMuted-foreground">{label}</span>
      <span className={`text-sm font-semibold ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-surfaceMuted-foreground">
      {children}
    </div>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-card border border-edge bg-cardElevated px-4 py-3 text-sm text-foreground placeholder:text-surfaceMuted-foreground/60 outline-none focus:border-primary/50 ${className}`}
    />
  );
}

export function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 rounded-full transition-colors ${on ? "bg-primary" : "bg-cardElevated"}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={`absolute top-1 h-5 w-5 rounded-full bg-foreground shadow ${on ? "left-6" : "left-1"}`}
      />
    </button>
  );
}
