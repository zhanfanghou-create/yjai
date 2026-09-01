import { useEffect, useRef, useState } from "react";
import { PageShell } from "../components/PageShell";
import { GlassCard } from "../components/GlassCard";
import { GradientButton } from "../components/GradientButton";

interface Props {
  version?: string;
  licenseText?: string;
  onBack: () => void;
  onNext: () => void;
}

const buildFallbackLicense = (version: string) => `艺镜AI-正式版 最终用户许可协议 (EULA)

版本: ${version}
版权所有 (c) 2026 艺镜 AI 团队

一、协议接受
本协议是您与艺镜 AI 团队之间关于本软件下载、安装和使用的法律协议。安装或使用本软件即表示您已阅读、理解并同意本协议全部条款。

二、软件授权
艺镜 AI 授予您一项个人的、非独占的、不可转让的、可撤销的使用授权。您可以在符合本协议的前提下安装并使用本软件。

三、限制条款
您不得对本软件进行反向工程、反编译、反汇编，或以任何形式尝试获取源代码。

四、责任限制
在法律允许的最大范围内，艺镜 AI 及其关联方不对因使用或无法使用本软件而产生的任何间接损失承担责任。

五、协议更新
本协议可能随软件更新而修订，最新版本将在软件启动时向您展示。
`;

export function License({ version, licenseText, onBack, onNext }: Props) {
  const [agreed, setAgreed] = useState(false);
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const scRef = useRef<HTMLDivElement>(null);
  const text = licenseText && licenseText.trim().length > 0 ? licenseText : buildFallbackLicense(version || '1.2.17');

  useEffect(() => {
    setAgreed(false);
    setScrolledEnd(false);
  }, [text]);

  const onScroll = () => {
    const el = scRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledEnd(true);
  };

  return (
    <PageShell>
      <div className="flex h-full flex-col px-10 py-8">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-white/40">Step 02</div>
          <h1 className="mt-1 text-[28px] font-semibold text-white">许可协议</h1>
          <p className="mt-1 text-[13px] text-white/50">请仔细阅读以下条款，继续安装即表示同意。</p>
        </div>

        <GlassCard className="mt-6 flex flex-1 flex-col overflow-hidden p-0">
          <div
            ref={scRef}
            onScroll={onScroll}
            className="scroll-thin flex-1 overflow-auto whitespace-pre-wrap px-6 py-5 text-[12.5px] leading-[1.65] text-white/70"
          >
            {text}
          </div>
        </GlassCard>

        <div className="mt-4 flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-3 text-[13px] text-white/75 select-none">
            <span
              onClick={() => scrolledEnd && setAgreed((v) => !v)}
              className={
                "relative grid h-5 w-5 place-items-center rounded-md border transition-all " +
                (agreed
                  ? "border-transparent bg-brand-gradient shadow-glow-soft"
                  : scrolledEnd
                  ? "border-white/30 bg-white/[0.03] hover:border-brand-400/60"
                  : "border-white/10 bg-white/[0.02] cursor-not-allowed")
              }
            >
              {agreed && <span className="h-2 w-2 rounded-sm bg-white" />}
            </span>
            <span className={scrolledEnd ? "" : "text-white/40"}>我已阅读并同意上述条款</span>
            {!scrolledEnd && <span className="text-[11px] text-brand-300">请先滑到底部</span>}
          </label>
          <div className="flex gap-3">
            <GradientButton variant="ghost" onClick={onBack}>
              返回
            </GradientButton>
            <GradientButton onClick={onNext} className={agreed ? "" : "pointer-events-none opacity-40"}>
              下一步
            </GradientButton>
          </div>
        </div>
      </div>
    </PageShell>
  );
}