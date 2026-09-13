import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { PublicStoreProvider } from "@/lib/public-store";

export const metadata: Metadata = {
  title: "Sho'rchi Billiard Club",
  description: "Premium billiard klub boshqaruv tizimi",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uz">
      <body className="font-sans">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <PublicStoreProvider>{children}</PublicStoreProvider>
      </body>
    </html>
  );
}
