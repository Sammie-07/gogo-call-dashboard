import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        natalia: "#8b5cf6",
        ferny: "#06b6d4",
      },
    },
  },
  plugins: [],
};
export default config;
