import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#09090b",
        paper: "#f5f1e8",
        coral: "#e7b67a",
        sand: "#121214",
        night: "#0f1115",
        dusk: "#171a22",
        mist: "#a7afc0",
        line: "rgba(255,255,255,0.1)"
      },
      fontFamily: {
        logo: ["Iowan Old Style", "Palatino Linotype", "Georgia", "serif"],
        display: [
          "SF Pro Display",
          "Segoe UI Variable Display",
          "Aptos Display",
          "Inter",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ],
        body: [
          "SF Pro Text",
          "Segoe UI Variable Text",
          "Aptos",
          "Inter",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ]
      },
      boxShadow: {
        soft: "0 30px 90px rgba(5, 8, 15, 0.28)",
        glow: "0 18px 50px rgba(231, 182, 122, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
