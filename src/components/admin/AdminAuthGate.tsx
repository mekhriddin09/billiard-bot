"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "ok" | "no-telegram" | "not-staff" | "error";

/**
 * Admin panel FAQAT Telegram Mini App ichida ochilganda ishlaydi.
 * Telegram.WebApp.initData'ni /api/auth/telegram'ga yuborib, xodim
 * sessiyasini (httpOnly cookie) o'rnatadi. Shundan keyingina bolalar
 * (AdminStoreProvider) /api/state'ni chaqira oladi.
 */
export default function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let cancelled = false;

    // Ba'zi Telegram klientlarida skript yuklangandan keyin ham initData
    // bir zumga bo'sh bo'lishi mumkin — bir necha marta qayta tekshiramiz
    // (jami ~1.5s), keyin ham bo'sh bo'lsa "Telegram emas" deb hisoblaymiz.
    let attempts = 0;
    const tryAuth = () => {
      if (cancelled) return;
      const tg = (window as any).Telegram?.WebApp;
      if (!tg?.initData) {
        attempts += 1;
        if (attempts < 8) {
          setTimeout(tryAuth, 200);
          return;
        }
        setStatus("no-telegram");
        return;
      }
      tg.ready?.();
      tg.expand?.();

      fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
      })
        .then(async (res) => {
          if (cancelled) return;
          const body = await res.json().catch(() => ({}));
          if (res.status === 403) {
            setStatus("not-staff");
          } else if (!res.ok) {
            setStatus("error");
            setDetail(body?.error ?? "Noma'lum xatolik");
          } else {
            setStatus("ok");
          }
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    };

    tryAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-3 text-4xl">🎱</div>
          <div className="text-sm text-surfaceMuted-foreground">Telegram orqali tekshirilmoqda…</div>
        </div>
      </div>
    );
  }

  if (status === "no-telegram") {
    return (
      <Message
        title="Bu sahifa faqat Telegram orqali ochiladi"
        text="Admin panelga kirish uchun botni Telegram ilovasida oching va Mini App tugmasini bosing."
      />
    );
  }

  if (status === "not-staff") {
    return (
      <Message
        title="Siz xodim sifatida ro'yxatdan o'tmagansiz"
        text="Telegram ID'ingizni klub egasiga yoki Super Admin'ga bering — u sizni Sozlamalar → Xodimlar orqali qo'shadi."
      />
    );
  }

  if (status === "error") {
    return <Message title="Xatolik yuz berdi" text={detail || "Qayta urinib ko'ring."} />;
  }

  return <>{children}</>;
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <div className="mb-3 text-4xl">🔒</div>
        <div className="text-base font-bold text-foreground">{title}</div>
        <div className="mt-2 text-sm leading-relaxed text-surfaceMuted-foreground">{text}</div>
      </div>
    </div>
  );
}
