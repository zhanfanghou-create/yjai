import { ButtonHTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";

type Variant = "primary" | "ghost" | "outline";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
  size?: "md" | "lg";
  icon?: ReactNode;
  full?: boolean;
}

export function GradientButton({
  children,
  variant = "primary",
  size = "md",
  icon,
  full,
  className = "",
  ...rest
}: Props) {
  const h = size === "lg" ? "h-12" : "h-10";
  const px = size === "lg" ? "px-6" : "px-5";
  const w = full ? "w-full" : "";

  if (variant === "ghost") {
    return (
      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        className={`relative ${h} ${px} ${w} inline-flex items-center justify-center gap-2 rounded-xl text-white/75 hover:text-white transition-colors hover:bg-white/5 ${className}`}
        {...(rest as any)}
      >
        {icon}
        <span className="text-[13px] font-medium tracking-wide">{children}</span>
      </motion.button>
    );
  }

  if (variant === "outline") {
    return (
      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        className={`relative ${h} ${px} ${w} inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] text-white/85 hover:border-brand-400/60 hover:bg-white/[0.06] hover:shadow-glow-soft transition-all ${className}`}
        {...(rest as any)}
      >
        {icon}
        <span className="text-[13px] font-medium">{children}</span>
      </motion.button>
    );
  }

  // primary
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      className={`group relative ${h} ${px} ${w} inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl text-white font-medium tracking-wide shadow-glow ${className}`}
      style={{ minWidth: size === "lg" ? 160 : undefined }}
      {...(rest as any)}
    >
      <span
        className="absolute inset-0 rounded-xl"
        style={{ background: "linear-gradient(135deg,#8B7CFF 0%,#7568FF 45%,#4B35FF 100%)" }}
      />
      <span
        className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: "linear-gradient(135deg,#A79CFF 0%,#7B6DFF 55%,#5B47FF 100%)",
          boxShadow: "0 0 30px rgba(117,104,255,.7), inset 0 0 24px rgba(255,255,255,.15)"
        }}
      />
      <span
        className="absolute inset-x-4 -bottom-4 h-6 rounded-full opacity-70 blur-2xl"
        style={{ background: "rgba(117,104,255,.75)" }}
      />
      {/* shine */}
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        <span className="absolute -left-1/2 top-0 h-full w-1/2 bg-white/25 blur-md -skew-x-12 opacity-0 group-hover:opacity-100 group-hover:translate-x-[300%] transition-all duration-700"/>
      </span>
      {icon && <span className="relative z-10">{icon}</span>}
      <span className="relative z-10 text-[13px]">{children}</span>
    </motion.button>
  );
}
