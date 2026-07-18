import { ReactNode } from "react";
import { Minus, X } from "lucide-react";
import logo from "../assets/logo.png";
import { AmbientBackground } from "./AmbientBackground";

interface Props {
  children: ReactNode;
  onClose?: () => void;
  onMinimize?: () => void;
}

export function InstallerWindow({ children, onClose, onMinimize }: Props) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className="relative overflow-hidden rounded-[14px] ring-brand shadow-window"
        style={{ width: 1180, height: 740 }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(13,16,37,.96) 0%, rgba(7,8,22,.96) 100%)",
          }}
        />
        <AmbientBackground />

        <div
          className="relative z-20 flex h-11 items-center justify-between pl-5 pr-2 select-none"
          style={{ WebkitAppRegion: "drag" } as any}
        >
          <div className="flex items-center gap-2.5">
            <img
              src={logo}
              alt="logo"
              className="h-5 w-5 drop-shadow-[0_0_10px_rgba(139,124,255,.6)]"
            />
            <span className="text-[13px] font-medium tracking-wide text-white/85">
              艺镜AI-正式版 安装向导
            </span>
          </div>
          <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: "no-drag" } as any}>
            <WinBtn onClick={onMinimize}><Minus size={14} /></WinBtn>
            <WinBtn danger onClick={onClose}><X size={14} /></WinBtn>
          </div>
        </div>

        <div className="relative z-10 flex h-[calc(100%-2.75rem)]">{children}</div>

        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/60 to-transparent" />
      </div>
    </div>
  );
}

function WinBtn({
  children,
  danger,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "group relative grid h-7 w-8 place-items-center rounded-md text-white/70 " +
        "hover:text-white transition-colors"
      }
    >
      <span
        className={
          "absolute inset-0 rounded-md opacity-0 transition-opacity group-hover:opacity-100 " +
          (danger
            ? "bg-gradient-to-br from-rose-500/40 to-rose-700/50 shadow-[0_0_16px_rgba(244,63,94,.45)]"
            : "bg-white/10 shadow-glow-soft")
        }
      />
      <span className="relative">{children}</span>
    </button>
  );
}