import { motion } from "framer-motion";
import { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, x: 24, scale: 0.99 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -24, scale: 0.99 }}
      transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
      className="relative flex h-full w-full flex-col"
    >
      {children}
    </motion.section>
  );
}
