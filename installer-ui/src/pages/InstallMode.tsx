import { useState } from "react";
import { PageShell } from "../components/PageShell";
import { GlassCard } from "../components/GlassCard";
import { GradientButton } from "../components/GradientButton";
import { Zap, Settings2, ArrowRight } from "lucide-react";

interface Props {
  defaultPath: string;
  onBack: () => void;
  onNext: (mode: "quick" | "custom") => void;
}

export function InstallMode({ defaultPath, onBack, onNext }: Props) {
  const [mode, setMode] = useState<"quick" | "custom">("quick");
  return (
    <PageShell>
      <div className="flex h-full flex-col px-10 py-8">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-white/40">Step 03</div>
          <h1 className="mt-1 text-[28px] font-semibold text-white">选择安装模式</h1>
          <p className="mt-1 text-[13px] text-white/50">两种模式满足您的偏好，随时可以在设置中重新配置。</p>
        </div>

        <div className="mt-6 grid flex-1 grid-cols-2 gap-6">
          <ModeCard
            active={mode === "quick"}
            onClick={() => setMode("quick")}
            icon={<Zap size={22} className="text-brand-300" />}
            title="快速安装"
            desc="默认安装到推荐目录，包含核心组件、AI 智能体与模型缓存。"
            tag="推荐"
            details={[`安装位置：${defaultPath}`, "包含：主程序 + 智能体 + 默认模型", "约 1.25 GB · 3 分钟"]}
          />
          <ModeCard
            active={mode === "custom"}
            onClick={() => setMode("custom")}
            icon={<Settings2 size={22} className="text-brand-300" />}
            title="自定义安装"
            desc="自由选择安装位置、组件与模型来源。"
            details={["自定义安装目录", "按需选择组件", "适合高级用户"]}
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-[12px] text-white/40">
            正在选择：<span className="text-white/80">{mode === "quick" ? "快速安装" : "自定义安装"}</span>
          </div>
          <div className="flex gap-3">
            <GradientButton variant="ghost" onClick={onBack}>
              返回
            </GradientButton>
            <GradientButton onClick={() => onNext(mode)} icon={<ArrowRight size={16} />}>
              下一步
            </GradientButton>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  desc,
  tag,
  details,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  tag?: string;
  details: string[];
}) {
  return (
    <div onClick={onClick} className="cursor-pointer">
      <GlassCard active={active} hoverable className="h-full p-6">
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.04] ring-1 ring-white/10 shadow-glow-soft">
              {icon}
            </div>
            <div className="flex items-center gap-2">
              {tag && (
                <span className="rounded-full border border-brand-400/40 bg-brand-500/15 px-2 py-0.5 text-[10px] font-medium text-brand-200">
                  {tag}
                </span>
              )}
              <span
                className={
                  "grid h-5 w-5 place-items-center rounded-full border " +
                  (active ? "border-transparent bg-brand-gradient shadow-glow-soft" : "border-white/20")
                }
              >
                {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
            </div>
          </div>

          <div className="mt-5 text-[18px] font-semibold text-white">{title}</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">{desc}</p>

          <div className="mt-auto space-y-1.5 pt-6">
            {details.map((d) => (
              <div key={d} className="flex items-center gap-2 text-[12px] text-white/55">
                <span className="h-1 w-1 rounded-full bg-brand-400/70" />
                {d}
              </div>
            ))}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}