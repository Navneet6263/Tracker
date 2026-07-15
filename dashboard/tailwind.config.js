/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#6366f1", dark: "#4f46e5", light: "#818cf8" },
        surface: "#0b1120",
        card: "rgba(30, 41, 59, 0.4)",
        border: "rgba(255, 255, 255, 0.1)",
      },
      backdropBlur: { xs: "2px", md: "12px", xl: "24px" },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
};
