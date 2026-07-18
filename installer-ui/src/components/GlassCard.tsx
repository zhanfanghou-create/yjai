import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  active?: boolean;
  hoverable?: boolean;
}

export function GlassCard({ children, className = "", active, hoverable }: Props) {
  return (
    <div
      className={
        "relative rounded-2xl glass transition-all duration-300 " +
        (active
          ? "ring-1 ring-brand-400/70 shadow-glow "
          : "ring-1 ring-white/5 ") +
        (hoverable ? "hover:-translate-y-[2px] hover:shadow-glow-soft " : "") +
        className
      }
    >
      {active && (
        <span className="pointer-events-none absolute -inset-px rounded-2xl"
              style={{
                background:
                  "linear-gradient(135deg, rgba(139,124,255,.55), rgba(75,53,255,.2) 55%, rgba(139,124,255,.55))",
                WebkitMask:
                  "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                WebkitMaskComposite: "xor" as any,
                maskComposite: "exclude",
                padding: 1,
                borderRadius: "1rem"
              }}
        />
      )}
      {children}
    </div>
  );
}
