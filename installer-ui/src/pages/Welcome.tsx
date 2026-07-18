import { PageShell } from "../components/PageShell";
import { MascotDisplay } from "../components/MascotDisplay";
import { GradientButton } from "../components/GradientButton";
import logo from "../assets/logo.png";
import { ArrowRight, Sparkles } from "lucide-react";

interface Props {
  version: string;
  onNext: () => void;
}

export function Welcome({ version, onNext }: Props) {
  return (
    <PageShell>
      <div className="grid h-full grid-cols-[1.15fr_1fr]">
        <div className="relative flex flex-col justify-between px-10 py-8">
          <div className="flex items-center gap-2 text-white/50">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-brand-400/30 bg-brand-400/10 px-2.5 text-[11px] font-medium text-brand-300">
              <Sparkles size={12} /> 艺镜AI · v{version}
            </span>
            <span className="text-[11px] uppercase tracking-widest text-white/30">Installation Wizard</span>
          </div>

          <div>
            <div className="mb-6 flex items-center gap-4">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-brand-500/25 blur-2xl" />
                <img src={logo} alt="logo" className="relative h-14 w-14 drop-shadow-[0_0_25px_rgba(139,124,255,.7)]" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-white/40">艺镜 AI</div>
                <div className="text-[13px] text-white/60">Intelligent Creative Studio</div>
              </div>
            </div>

            <h1 className="text-[42px] font-semibold leading-[1.05] tracking-tight">
              <span className="text-white">欢迎使用 </span>
              <span className="gradient-text">艺镜 AI</span>
            </h1>
            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-white/60">
              一个懂你的智能创作助手。让想象力，进入无限可能的境界。
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {["多模态创作", "AI 智能体", "无限画布", "本地私域"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/60 backdrop-blur"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <GradientButton size="lg" onClick={onNext} icon={<ArrowRight size={16} />}>
              立即安装
            </GradientButton>
            <div className="text-[11px] text-white/35">
              安装即代表您同意 <span className="text-brand-300">许可协议</span> 与 <span className="text-brand-300">隐私政策</span>
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(circle at 60% 45%, rgba(117,104,255,.25), transparent 60%)" }}
          />
          <MascotDisplay size={300} variant="pedestal" />
        </div>
      </div>
    </PageShell>
  );
}