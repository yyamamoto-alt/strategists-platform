import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["'Noto Serif JP'", "serif"],
      },
      colors: {
        brand: {
          DEFAULT: "#C13028",
          light: "#d4453d",
          dark: "#a52720",
          muted: "rgba(193, 48, 40, 0.16)",
        },
        surface: {
          DEFAULT: "#0A0A0A",
          raised: "#0F0F0F",
          card: "#141414",
          elevated: "#1A1A1A",
        },
        primary: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#C13028",
          600: "#C13028",
          700: "#a52720",
          800: "#871f1a",
          900: "#6b1914",
          950: "#450a0a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
