"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

export function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

const spring = { type: "spring", stiffness: 300, damping: 34, mass: 0.9 } as const;

/** Mobil — pastdan chiqadigan sheet, desktop — o'ngdan panel. Liquid glass. */
export default function Sheet({
  open,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const desktop = useIsDesktop();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            className={
              desktop
                ? `glass-strong fixed right-0 top-0 z-50 h-full ${wide ? "w-[560px]" : "w-[440px]"} overflow-y-auto shadow-sheet`
                : "glass-strong fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-sheet shadow-sheet"
            }
            initial={desktop ? { x: "100%" } : { y: "100%" }}
            animate={desktop ? { x: 0 } : { y: 0 }}
            exit={desktop ? { x: "100%" } : { y: "100%" }}
            transition={spring}
          >
            {!desktop && (
              <div className="sticky top-0 z-10 flex justify-center pb-1 pt-3">
                <div className="h-1 w-10 rounded-full bg-foreground/20" />
              </div>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
