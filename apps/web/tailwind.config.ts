import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#f0f9ff", 400: "#38bdf8", 500: "#0ea5e9", 600: "#0284c7" },
      },
    },
  },
  plugins: [],
};

export default config;
