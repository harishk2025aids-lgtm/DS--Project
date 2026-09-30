/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg0: "#12151A",
        bg1: "#1A1F26",
        bg2: "#212832",
        line: "#2B333D",
        "line-strong": "#3A4450",
        hi: "#ECEEF1",
        mid: "#9FAAB6",
        low: "#66707C",
        molten: "#FF6A39",
        "molten-dim": "#7A3C24",
        coolant: "#4FA3D1",
        good: "#5FBE87",
        warn: "#F2B84B",
        danger: "#E5484D",
      },
      fontFamily: {
        display: ["Barlow Condensed", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
        sans: ["Inter", "sans-serif"],
      },
      borderRadius: {
        sm: "3px",
        md: "5px",
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "48px 48px",
      },
    },
  },
  plugins: [],
};
