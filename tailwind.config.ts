import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ---- Yangi (mijoz Mini App) dizayn tokenlari — globals.css'dagi
        // CSS o'zgaruvchilaridan o'qiydi. Admin panel eski `ink/brand/cream`
        // tokenlaridan foydalanishda davom etadi, bu ikkalasi mustaqil.
        // MUHIM: asosiy tonlar "R G B" formatida saqlanadi (globals.css),
        // shuning uchun bu yerda rgb(var(--x) / <alpha-value>) bilan
        // o'raladi — shu orqali bg-primary/10 kabi opacity modifikatorlari
        // to'g'ri natija beradi.
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
        cardElevated: "rgb(var(--card-elevated) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
          hover: "var(--primary-hover)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        surfaceMuted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        edge: "var(--border)",
        edgeStrong: "var(--border-strong)",
        destructive: "rgb(var(--destructive) / <alpha-value>)",
        destructiveSoft: "var(--destructive-soft)",
        success: "rgb(var(--success) / <alpha-value>)",
        successSoft: "var(--success-soft)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        warningSoft: "var(--warning-soft)",
        dark: "rgb(var(--dark) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Georgia", "Times New Roman", "serif"],
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Inter",
          "sans-serif",
        ],
        mono: ["SF Mono", "ui-monospace", "Menlo", "monospace"],
      },
      boxShadow: {
        "glow-green": "0 1px 12px -3px rgba(52,168,120,0.25)",
        "glow-red": "0 1px 12px -3px rgba(201,86,78,0.25)",
        "glow-gold": "0 1px 12px -3px rgba(201,165,94,0.25)",
        card: "0 3px 16px -2px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.3)",
        sheet: "0 -8px 36px rgba(0,0,0,0.6)",
        cta: "0 8px 20px -6px rgb(var(--primary) / 0.45)",
        navFloat: "0 8px 28px -6px rgba(20,20,15,0.18)",
      },
      borderRadius: {
        xl2: "1.25rem",
        // ---- Yangi tizim: barcha burchaklar --radius'dan hosil bo'ladi.
        card: "var(--radius)",
        sheet: "calc(var(--radius) + 0.5rem)",
        pill: "calc(var(--radius) + 1rem)",
        chip: "calc(var(--radius) - 0.5rem)",
        control: "calc(var(--radius) - 0.35rem)",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
