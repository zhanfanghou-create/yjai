import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "../components/PageShell";
import { ProgressBar } from "../components/ProgressBar";
import { MascotDisplay } from "../components/MascotDisplay";
import { Check, Loader2 } from "lucide-react";

interface Props {
  targetPath: string;
  onDone: (result: { ok: boolean; reason?: string }) => void;
}

const STAGES = [
  { key: "prepare",  label: "准备安装",       at: 10 },
  { key: "extract",  label: "释放主程序文件", at: 85 },
  { key: "shortcut", label: "创建快捷方式",   at: 98 },
  { key: "done",     label: "安装完成",       at: 100 },
] as const;

export function Installing({ targetPath, onDone }: Props) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<string>("prepare");
  const [label, setLabel] = useState<string>("准备安装");
  const [logs, setLogs] = useState<string[]>([]);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!window.installer) {
      // Dev fallback: 模拟进度
      const start = performance.now();
      const total = 6000;
      let raf = 0;
      const tick = (t: number) => {
        const p = Math.min(100, ((t - start) / total) * 100);
        setProgress(p);
        if (p < 100) raf = requestAnimationFrame(tick);
        else setTimeout(() => onDone({ ok: true }), 500);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    const offProg = window.installer.onProgress((p) => {
      setProgress(p.percent);
      setPhase(p.phase);
      setLabel(p.label);
    });
    const offLog = window.installer.onLog((l) => {
      setLogs((prev) => (prev.length > 40 ? [...prev.slice(-40), l.text] : [...prev, l.text]));
    });
    (async () => {
      const res = await window.installer!.start({
        targetPath,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        autoStart: false,
      });
      offProg?.();
      offLog?.();
      setTimeout(() => onDone(res), 600);
    })();
    return () => {
      offProg?.();
      offLog?.();
    };
  }, [onDone, targetPath]);

  const stageState = useMemo(() => {
    return STAGES.map((s, i) => {
      const prev = STAGES[i - 1]?.at ?? 0;
      const done = progress >= s.at;
      const active = !done && progress >= prev;
      return { ...s, done, active };
    });
  }, [progress]);

  return (
    <PageShell>
      <div className="grid h-full grid-cols-[1.35fr_1fr] px-2">
        <div className="flex flex-col justify-between px-8 py-8">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-white/40">Step 05</div>
            <h1 className="mt-1 text-[28px] font-semibold text-white">
              正在安装 <span className="gradient-text">艺镜 AI</span>
            </h1>
            <p className="mt-1 text-[13px] text-white/50">请稍候，这可能需要几十秒到几分钟…</p>
          </div>

          <div className="flex flex-col items-start">
            <div className="relative">
              <div className="text-[110px] font-semibold leading-none tracking-tight gradient-text drop-shadow-[0_0_40px_rgba(117,104,255,.35)]">
                {Math.floor(progress)}
                <span className="ml-1 text-[42px] align-top text-white/60">%</span>
              </div>
              <div
                className="absolute -inset-8 -z-10 rounded-full opacity-60 blur-3xl"
                style={{
                  background:
                    "radial-gradient(circle at 30% 40%, rgba(139,124,255,.45), transparent 65%)",
                }}
              />
            </div>
            <div className="mt-3 w-[420px]">
              <ProgressBar value={progress} />
              <div className="mt-1.5 flex justify-between text-[11px] text-white/40">
                <span>{label}</span>
                <span className="truncate text-white/40">阶段: {phase}</span>
              </div>
            </div>
          </div>

          <ul className="space-y-2.5">
            {stageState.map((s) => (
              <li key={s.key} className="flex items-center gap-3 text-[13px]">
                <span
                  className={
                    "grid h-6 w-6 place-items-center rounded-full " +
                    (s.done
                      ? "bg-brand-gradient text-white shadow-glow-soft"
                      : s.active
                      ? "bg-white/[0.04] ring-1 ring-brand-400/40"
                      : "bg-white/[0.03] ring-1 ring-white/10")
                  }
                >
                  {s.done ? (
                    <Check size={13} strokeWidth={3} />
                  ) : s.active ? (
                    <Loader2 size={13} className="animate-spin text-brand-300" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                  )}
                </span>
                <span className={s.done ? "text-white/85" : s.active ? "text-white/85" : "text-white/40"}>
                  {s.label}
                </span>
                {s.active && <span className="ml-1 text-[11px] text-brand-300">进行中</span>}
                {s.done && <span className="ml-1 text-[11px] text-emerald-300/80">已完成</span>}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 55% 45%, rgba(117,104,255,.28), transparent 60%)",
            }}
          />
          <MascotDisplay size={280} variant="pedestal" />
          {logs.length > 0 && (
            <div className="scroll-thin absolute bottom-3 left-3 right-3 max-h-24 overflow-auto rounded-lg border border-white/10 bg-black/40 p-2 text-[10.5px] leading-relaxed text-white/50">
              {logs.slice(-6).map((l, i) => (
                <div key={i} className="truncate">
                  {l}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}