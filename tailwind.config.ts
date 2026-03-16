import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        paper: "#f9fafb",
        coral: "#f97316",
        sand: "#fff7ed"
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        body: ["ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 20px 60px rgba(17, 24, 39, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
