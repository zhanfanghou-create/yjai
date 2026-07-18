import { useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { GlassCard } from "../components/GlassCard";
import { GradientButton } from "../components/GradientButton";
import { Folder, HardDrive, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";

interface Props {
  value: string;
  onBack: () => void;
  onNext: (path: string) => void;
}

export function Directory({ value, onBack, onNext }: Props) {
  const [path, setPath] = useState(value);
  const [needGB, setNeedGB] = useState(1.25);
  const [freeGB, setFreeGB] = useState(0);
  const [totalGB, setTotalGB] = useState(0);
  const enough = freeGB >= needGB;

  useEffect(() => {
    setPath(value);
  }, [value]);

  useEffect(() => {
    (async () => {
      if (!window.installer) return;
      const info = await window.installer.diskInfo(path);
      setFreeGB(info.freeGB);
      setTotalGB(info.totalGB);
      setNeedGB(info.needGB);
    })();
  }, [path]);

  const browse = async () => {
    if (!window.installer) return;
    const picked = await window.installer.pickDirectory(path);
    if (picked) setPath(picked);
  };

  const usedPct = totalGB > 0 ? Math.max(4, Math.min(100, ((totalGB - freeGB) / totalGB) * 100)) : 0;

  return (
    <PageShell>
      <div className="flex h-full flex-col px-10 py-8">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-white/40">Step 04</div>
          <h1 className="mt-1 text-[28px] font-semibold text-white">选择安装目录</h1>
          <p className="mt-1 text-[13px] text-white/50">请选择将艺镜 AI 安装到的位置，我们会在此创建所需文件夹。</p>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <div className="mb-2 text-[12px] uppercase tracking-[0.2em] text-white/40">安装路径</div>
            <div className="flex gap-3">
              <label className="group flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 h-12 focus-within:border-brand-400/60 focus-within:shadow-glow-soft transition-all">
                <Folder size={16} className="text-brand-300" />
                <input
                  className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                />
              </label>
              <GradientButton variant="outline" size="lg" onClick={browse}>
                浏览…
              </GradientButton>
            </div>
          </div>

          <GlassCard className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <HardDrive size={16} className="text-brand-300" />
              <span className="text-[13px] font-medium text-white/80">磁盘空间</span>
              <span
                className={
                  "ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] " +
                  (enough
                    ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : "border border-amber-400/30 bg-amber-400/10 text-amber-300")
                }
              >
                {enough ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                {enough ? "空间充足" : "空间不足"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <SpaceStat label="需要空间" value={`${needGB.toFixed(2)} GB`} tone="brand" />
              <SpaceStat label="可用空间" value={freeGB > 0 ? `${freeGB.toFixed(1)} GB` : "读取中…"} tone={enough ? "good" : "warn"} />
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/40">
                <span>目标磁盘占用</span>
                <span>{Math.round(usedPct)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${usedPct}%`,
                    background: "linear-gradient(90deg,#8B7CFF,#4B35FF)",
                  }}
                />
              </div>
            </div>
          </GlassCard>
        </div>

        <div className="mt-auto flex items-center justify-end gap-3 pt-6">
          <GradientButton variant="ghost" onClick={onBack}>
            返回
          </GradientButton>
          <GradientButton
            onClick={() => onNext(path)}
            className={enough ? "" : "pointer-events-none opacity-40"}
            icon={<ArrowRight size={16} />}
          >
            开始安装
          </GradientButton>
        </div>
      </div>
    </PageShell>
  );
}

function SpaceStat({ label, value, tone }: { label: string; value: string; tone: "brand" | "good" | "warn" }) {
  const color =
    tone === "brand" ? "gradient-text" : tone === "good" ? "text-emerald-300" : "text-amber-300";
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">{label}</div>
      <div className={"mt-1 text-[22px] font-semibold " + color}>{value}</div>
    </div>
  );
}