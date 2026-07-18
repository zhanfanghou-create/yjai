import { useState } from "react";
import { PageShell } from "../components/PageShell";
import { GradientButton } from "../components/GradientButton";
import { MascotDisplay } from "../components/MascotDisplay";
import { Check, Sparkles, Rocket, AlertTriangle } from "lucide-react";

interface Props {
  version: string;
  targetPath: string;
  result: { ok: boolean; reason?: string } | null;
  onLaunch: () => void;
  onOpenDir: () => void;
  onClose: () => void;
}

export function Finish({ version, targetPath, result, onLaunch, onOpenDir, onClose }: Props) {
  const [openDir, setOpenDir] = useState(false);
  const failed = result && !result.ok;

  return (
    <PageShell>
      <div className="grid h-full grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col justify-between px-10 py-8">
          <div className="text-[11px] uppercase tracking-[0.28em] text-white/40">Step 06</div>

          <div>
            <div
              className={
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] " +
                (failed
                  ? "border border-rose-400/40 bg-rose-500/10 text-rose-300"
                  : "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300")
              }
            >
              {failed ? <AlertTriangle size={12} /> : <Sparkles size={12} />}
              {failed ? "安装未完成" : "Installation Complete"}
            </div>
            <h1 className="mt-4 text-[42px] font-semibold leading-tight text-white">
              {failed ? "安装未成功" : "安装完成！"}
            </h1>
            <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-white/60">
              {failed
                ? `安装过程中发生了问题：${result?.reason || "未知错误"}。您可以重试，或在稍后重新运行安装引导。`
                : "艺镜 AI 已成功安装到您的电脑。点击「立即体验」进入创作空间，开启无限可能。"}
            </p>

            <div className="mt-6 grid max-w-md grid-cols-2 gap-3 text-[12px]">
              <Info k="版本" v={`v${version} · 正式版`} />
              <Info k="安装位置" v={targetPath} />
              <Info k="桌面快捷方式" v={failed ? "未创建" : "已创建"} />
              <Info k="开始菜单" v={failed ? "未创建" : "已创建"} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
              <GradientButton size="lg" onClick={onLaunch} icon={<Rocket size={16} />} className={failed ? "pointer-events-none opacity-40" : ""}>
                立即体验
              </GradientButton>
              <GradientButton
                variant="outline"
                size="lg"
                onClick={() => {
                  onOpenDir();
                  setOpenDir(true);
                }}
                className={failed ? "pointer-events-none opacity-40" : ""}
              >
                打开安装目录
              </GradientButton>
              <GradientButton variant="ghost" size="lg" onClick={onClose}>
                关闭
              </GradientButton>
            </div>
            {openDir && !failed && (
              <div className="flex items-center gap-2 text-[12px] text-white/50">
                <Check size={13} className="text-emerald-300" /> 已在文件资源管理器中打开
              </div>
            )}
          </div>
        </div>

        <div className="relative flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(circle at 55% 45%, rgba(139,124,255,.28), transparent 60%)" }}
          />
          <MascotDisplay size={280} variant={failed ? "pedestal" : "celebrate"} />
        </div>
      </div>
    </PageShell>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-white/40">{k}</div>
      <div className="mt-0.5 truncate text-[12.5px] text-white/85" title={v}>
        {v}
      </div>
    </div>
  );
}