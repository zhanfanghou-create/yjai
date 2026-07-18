import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { STEPS, StepKey } from "../steps";

interface Props {
  current: StepKey;
}

export function StepSidebar({ current }: Props) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <aside className="relative flex w-[210px] flex-shrink-0 flex-col border-r border-white/5 bg-black/20 backdrop-blur-md">
      <div className="px-5 pt-4 pb-2">
        <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">安装进度</div>
      </div>
      <nav className="flex-1 space-y-1.5 px-3 pt-2">
        {STEPS.map((s, i) => {
          const state: "done" | "active" | "pending" =
            i < currentIndex ? "done" : i === currentIndex ? "active" : "pending";
          return (
            <div key={s.key} className="relative">
              {state === "active" && (
                <motion.div
                  layoutId="active-pill"
                  className="absolute inset-0 rounded-xl"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(139,124,255,.28), rgba(75,53,255,.28))",
                    boxShadow:
                      "0 0 22px rgba(117,104,255,.45), inset 0 0 0 1px rgba(176,166,255,.35)",
                  }}
                />
              )}
              <div className="relative flex items-center gap-3 rounded-xl px-3 py-2.5">
                <StepBadge state={state} index={i + 1} />
                <div className="flex-1">
                  <div
                    className={
                      "text-[13px] " +
                      (state === "active"
                        ? "font-medium text-white"
                        : state === "done"
                        ? "text-white/80"
                        : "text-white/40")
                    }
                  >
                    {s.label}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>
      <div className="px-5 pb-4 pt-2 text-[10px] text-white/30">艺镜AI-正式版 · v1.1.0</div>
    </aside>
  );
}

function StepBadge({
  state,
  index,
}: {
  state: "done" | "active" | "pending";
  index: number;
}) {
  if (state === "done") {
    return (
      <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-gradient text-white shadow-glow-soft">
        <Check size={13} strokeWidth={3} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="relative grid h-6 w-6 place-items-center">
        <span className="absolute inset-0 rounded-full bg-brand-gradient shadow-glow" />
        <span className="absolute inset-[3px] rounded-full bg-night-900" />
        <span className="relative h-2 w-2 rounded-full bg-brand-gradient" />
        <span className="pulse-ring absolute inset-0 rounded-full border border-brand-400/60" />
      </span>
    );
  }
  return (
    <span className="grid h-6 w-6 place-items-center rounded-full border border-white/15 text-[10px] text-white/40">
      {index}
    </span>
  );
}