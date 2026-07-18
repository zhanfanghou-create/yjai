export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EEEAFF",
          100: "#D9D2FF",
          300: "#B0A6FF",
          400: "#8B7CFF",
          500: "#7568FF",
          600: "#5B4BFF",
          700: "#4B35FF",
          900: "#1B1339"
        },
        night: {
          950: "#070816",
          900: "#0D1025",
          800: "#131735",
          700: "#1B2049"
        }
      },
      boxShadow: {
        glow: "0 0 40px rgba(117,104,255,0.45)",
        "glow-soft": "0 0 22px rgba(139,124,255,0.35)",
        window: "0 30px 120px -20px rgba(75, 53, 255, 0.35), 0 8px 40px rgba(0,0,0,0.55)"
      },
      fontFamily: {
        sans: ["'Inter'", "'PingFang SC'", "'Microsoft YaHei'", "system-ui", "sans-serif"],
        display: ["'Inter'", "'PingFang SC'", "sans-serif"]
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #8B7CFF 0%, #4B35FF 100%)",
        "brand-radial": "radial-gradient(circle at 30% 20%, rgba(139,124,255,0.35), transparent 60%)"
      }
    }
  },
  plugins: []
};
