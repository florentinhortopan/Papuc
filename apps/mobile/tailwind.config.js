/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#0b0b0f",
        surface: "#16161d",
        surfaceAlt: "#1f1f29",
        border: "#2a2a36",
        primary: "#7c5cff",
        primaryFg: "#ffffff",
        muted: "#8b8b96",
        success: "#3ddc97",
        warning: "#ffb454",
        danger: "#ff5c7a",
        text: "#f5f5f7",
        textMuted: "#9aa0aa",
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
