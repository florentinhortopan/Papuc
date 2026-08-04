import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        background: "#0b0b0f",
        surface: "#16161d",
        surfaceAlt: "#1f1f29",
        border: "#2a2a36",
        text: "#f5f5f7",
        textMuted: "#8b8b96",
        primary: "#7c5cff",
        primaryFg: "#ffffff",
        success: "#3ddc97",
        warning: "#f8b84e",
        danger: "#ff5c7a",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "sans-serif",
        ],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        swirl: {
          to: { transform: "rotate(360deg)" },
        },
        "swirl-reverse": {
          to: { transform: "rotate(-360deg)" },
        },
        "progress-shimmer": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "scale-in": "scale-in 150ms ease-out",
        swirl: "swirl 0.9s linear infinite",
        "swirl-reverse": "swirl-reverse 1.4s linear infinite",
        "progress-shimmer":
          "progress-shimmer 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
