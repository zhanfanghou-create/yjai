import { motion } from "framer-motion";

interface Props {
  value: number; // 0..100
}

export function ProgressBar({ value }: Props) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
      {/* fill */}
      <motion.div
        className="relative h-full rounded-full"
        style={{
          background: "linear-gradient(90deg,#8B7CFF 0%,#7568FF 45%,#4B35FF 100%)",
          boxShadow: "0 0 22px rgba(117,104,255,.65)"
        }}
        initial={{ width: 0 }}
        animate={{ width: `${v}%` }}
        transition={{ type: "spring", stiffness: 60, damping: 18 }}
      >
        <span className="absolute inset-0 progress-stripes rounded-full opacity-90" />
      </motion.div>
      {/* head glow */}
      <motion.span
        className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full"
        style={{
          background: "radial-gradient(circle,#B0A6FF, transparent 65%)",
          filter: "blur(2px)"
        }}
        initial={{ left: "0%" }}
        animate={{ left: `calc(${v}% - 8px)` }}
        transition={{ type: "spring", stiffness: 60, damping: 18 }}
      />
    </div>
  );
}
