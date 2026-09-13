"use client";

import { useEffect, useMemo, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Btn, RadioCard } from "./controls";
import PriceTag from "./PriceTag";

export type BookingOption = {
  id: string;
  label: string;
  price?: number;
  badge?: string;
};

export type BookingOptionGroup = {
  id: string;
  title: string;
  options: BookingOption[];
};

/**
 * Qayta ishlatiluvchi Bottom Sheet naqshi — tanlov kerak bo'lgan bron
 * oqimlari uchun. Rasm + sarlavha + (ixtiyoriy) tanlov guruhlari + jonli
 * narx bilan bitta CTA tugma. Tugma bosilishi — YAKUNIY amal, qo'shimcha
 * tasdiqlash oynasi ochilmaydi.
 */
export default function BookingSheet({
  open,
  onClose,
  image,
  title,
  subtitle,
  groups = [],
  basePrice = 0,
  ctaLabel = "Bron qilish",
  onConfirm,
  note,
  disabled = false,
}: {
  open: boolean;
  onClose: () => void;
  image?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  groups?: BookingOptionGroup[];
  basePrice?: number;
  ctaLabel?: string;
  onConfirm: (selected: Record<string, string>) => void;
  note?: React.ReactNode;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const defaults: Record<string, string> = {};
    groups.forEach((g) => {
      if (g.options[0]) defaults[g.id] = g.options[0].id;
    });
    setSelected(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total = useMemo(() => {
    let sum = basePrice;
    groups.forEach((g) => {
      const opt = g.options.find((o) => o.id === selected[g.id]);
      if (opt?.price) sum += opt.price;
    });
    return sum;
  }, [basePrice, groups, selected]);

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="animate-slide-up px-5 pb-8">
        {image && <div className="mx-auto max-w-[220px]">{image}</div>}

        <div className="mt-4 text-center">
          <div className="text-xl font-extrabold text-foreground">{title}</div>
          {subtitle && <div className="mt-1 text-sm font-bold">{subtitle}</div>}
        </div>

        {groups.map((g) => (
          <div key={g.id} className="mt-5">
            <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-surfaceMuted-foreground">
              {g.title}
            </div>
            <div className="space-y-2">
              {g.options.map((o) => (
                <RadioCard
                  key={o.id}
                  label={o.label}
                  badge={o.badge}
                  price={o.price ? `${o.price.toLocaleString("ru-RU")} so'm` : undefined}
                  selected={selected[g.id] === o.id}
                  onClick={() => setSelected((s) => ({ ...s, [g.id]: o.id }))}
                />
              ))}
            </div>
          </div>
        ))}

        {note && (
          <div className="mt-5 rounded-control border border-edge bg-surfaceMuted p-3.5 text-xs leading-relaxed text-surfaceMuted-foreground">
            {note}
          </div>
        )}

        <div className="mt-6">
          <Btn variant="primary" disabled={disabled} className="w-full" onClick={() => onConfirm(selected)}>
            <span className="flex w-full items-center justify-center gap-1.5">
              {ctaLabel} · <PriceTag amount={total} size="sm" tone="onPrimary" />
            </span>
          </Btn>
        </div>
      </div>
    </Sheet>
  );
}
