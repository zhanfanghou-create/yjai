import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';

type LicenseStatus = 'loading' | 'trial' | 'activated' | 'expired';

interface LicenseInfo {
  status: LicenseStatus;
  machineCode: string;
  activationCode?: string;
  activatedAt?: string;
  expiresAt?: string;
  daysLeft: number;
  message?: string;
  trialStartedAt?: string;
}

// SVG 图标组件
const UserIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const CheckCircleIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const ClockIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

const AlertCircleIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const CloseIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CopyIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const CheckIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const POPUP_WIDTH = 360;

export const LicensePopup: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [activating, setActivating] = useState(false);
  const [resultMsg, setResultMsg] = useState('');
  const [resultType, setResultType] = useState<'success' | 'error' | 'info'>('info');
  const [popupPos, setPopupPos] = useState<{ top: number; left: number }>({ top: 40, left: 0 });
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // 从全局 store 读取状态
  const licenseStatus = useAppStore(s => s.licenseStatus);
  const licenseInfo = useAppStore(s => s.licenseInfo);
  const setLicenseStatus = useAppStore(s => s.setLicenseStatus);

  // 点击外部关闭
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    if (visible) {
      setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [visible]);

  // 弹出时重置状态 + 计算位置（自动检测软件边缘，向左避让不超出界面）
  useEffect(() => {
    if (visible) {
      setActivationCode('');
      setResultMsg('');
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        const margin = 8;
        const winW = window.innerWidth;
        // 优先与按钮右对齐；若超出右边则贴右边距，若超出左边则贴左边距
        let left = rect.right - POPUP_WIDTH;
        if (left + POPUP_WIDTH > winW - margin) {
          left = winW - margin - POPUP_WIDTH;
        }
        if (left < margin) {
          left = margin;
        }
        setPopupPos({ top: rect.bottom + 6, left });
      }
    }
  }, [visible]);

  const handleActivate = async () => {
    if (!activationCode.trim() || !licenseInfo?.machineCode) return;
    setActivating(true);
    setResultMsg('');
    try {
      const r = await window.yijingAPI?.license?.validate(activationCode.trim(), licenseInfo.machineCode);
      if (r?.valid) {
        setResultMsg('激活成功！感谢使用艺镜AI');
        setResultType('success');
        // 重新获取授权信息
        const mc = await window.yijingAPI?.license?.getMachineCode();
        if (mc) {
          const info = await window.yijingAPI?.license?.getInfo(mc);
          if (info) {
            setLicenseStatus(info.status as any, {
              machineCode: info.machineCode,
              daysLeft: info.daysLeft,
              expiresAt: info.expiresAt,
              activationCode: info.activationCode,
            });
          }
        }
      } else {
        setResultMsg(r?.error || '激活失败');
        setResultType('error');
      }
    } catch (e: any) {
      setResultMsg(e.message || '网络错误');
      setResultType('error');
    }
    setActivating(false);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setResultMsg('已复制');
      setResultType('info');
      setTimeout(() => setResultMsg(''), 2000);
    });
  };

  if (!licenseInfo) return null;

  const statusColor = licenseStatus === 'activated' ? '#34d399' : licenseStatus === 'trial' ? '#fbbf24' : '#ef4444';
  const daysText = licenseStatus === 'expired' ? '已过期' : `${licenseInfo.daysLeft}天`;

  // 状态图标
  const StatusIcon = licenseStatus === 'activated' 
    ? <CheckCircleIcon color={statusColor} size={18} />
    : licenseStatus === 'trial' 
    ? <ClockIcon color={statusColor} size={18} />
    : <AlertCircleIcon color={statusColor} size={18} />;

  return (
    <>
      {/* 用户图标按钮 */}
      <button
        ref={btnRef}
        className="title-bar-license-btn"
        onClick={() => setVisible(!visible)}
        title={`${licenseStatus === 'activated' ? '已激活' : licenseStatus === 'trial' ? `试用期 ${daysText}` : '已过期'}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 6,
          border: `1px solid ${statusColor}44`,
          background: `${statusColor}11`,
          color: 'var(--text-primary)',
          cursor: 'pointer', fontSize: 12,
          marginRight: 4,
          WebkitAppRegion: 'no-drag',
          whiteSpace: 'nowrap',
        } as React.CSSProperties}
      >
        <UserIcon color={statusColor} />
        <span style={{ color: statusColor, fontWeight: 500, fontSize: 11 }}>
          {licenseStatus === 'activated' ? '已激活' : daysText}
        </span>
      </button>

      {/* 弹出面板 */}
      {visible && (
        <div
          ref={popupRef}
          style={{
            position: 'fixed', top: popupPos.top, left: popupPos.left,
            width: POPUP_WIDTH,
            background: 'var(--glass-bg-strong, rgba(40,40,40,0.92))',
            backdropFilter: 'blur(var(--blur-amount, 20px)) saturate(160%)',
            WebkitBackdropFilter: 'blur(var(--blur-amount, 20px)) saturate(160%)',
            border: '1px solid var(--glass-border, rgba(255,255,255,0.15))',
            borderRadius: 12,
            boxShadow: 'var(--glass-shadow-strong, 0 8px 32px rgba(0,0,0,0.5))',
            zIndex: 10001, padding: 20, fontSize: 13,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>授权信息</h3>
            <button
              onClick={() => setVisible(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px', display: 'flex' }}
            >
              <CloseIcon size={16} />
            </button>
          </div>

          {/* 状态条 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            borderRadius: 8, marginBottom: 16, fontSize: 13,
            background: `${statusColor}11`, border: `1px solid ${statusColor}22`,
          }}>
            {StatusIcon}
            <span>
              <strong style={{ color: statusColor }}>
                {licenseStatus === 'activated' ? '已激活' : licenseStatus === 'trial' ? `试用期 ${licenseInfo.daysLeft}天` : '已过期'}
              </strong>
              {licenseInfo.expiresAt && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                  到期 {new Date(licenseInfo.expiresAt).toLocaleDateString('zh-CN')}
                </span>
              )}
            </span>
          </div>

          {/* 机器码 */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>本机机器码</div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--bg-primary)', padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--border-color)',
              fontFamily: 'monospace', fontSize: 12, letterSpacing: 1,
            }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>
                {licenseInfo.machineCode}
              </span>
              <button onClick={() => handleCopy(licenseInfo.machineCode)} style={{
                background: 'none', border: '1px solid var(--border-color)', borderRadius: 4,
                padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <CopyIcon size={12} />复制
              </button>
            </div>
          </div>

          {/* 激活码输入 */}
          {licenseStatus !== 'activated' && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>激活码</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={activationCode}
                  onChange={e => setActivationCode(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleActivate()}
                  placeholder="输入激活码"
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 6, fontSize: 13,
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)', color: 'var(--text-primary)',
                    outline: 'none', fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={handleActivate}
                  disabled={activating || !activationCode.trim()}
                  style={{
                    padding: '8px 16px', borderRadius: 6, border: 'none',
                    background: activating ? 'var(--text-muted)' : 'var(--sp-accent)',
                    color: '#fff', cursor: activating ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
                  }}
                >{activating ? '验证中...' : '激活'}</button>
              </div>
            </div>
          )}

          {/* 已激活的激活码显示 */}
          {licenseStatus === 'activated' && licenseInfo.activationCode && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>激活码</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--bg-primary)', padding: '6px 10px', borderRadius: 6,
                border: '1px solid var(--border-color)',
                fontFamily: 'monospace', fontSize: 12, letterSpacing: 1,
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {licenseInfo.activationCode}
                </span>
                <button onClick={() => handleCopy(licenseInfo.activationCode!)} style={{
                  background: 'none', border: '1px solid var(--border-color)', borderRadius: 4,
                  padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <CopyIcon size={12} />复制
                </button>
              </div>
            </div>
          )}

          {/* 结果消息 */}
          {resultMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 12,
              background: resultType === 'success' 
                ? 'rgba(52,211,153,0.1)' 
                : resultType === 'error' 
                ? 'rgba(239,68,68,0.1)' 
                : 'rgba(139,92,246,0.1)',
              color: resultType === 'success' ? '#34d399' : resultType === 'error' ? '#ef4444' : 'var(--sp-accent)',
            }}>
              {resultType === 'success' && <CheckIcon color="#34d399" />}
              {resultType === 'error' && <XIcon color="#ef4444" />}
              {resultMsg}
            </div>
          )}

          {/* 底部联系信息 */}
          <div style={{
            borderTop: '1px solid var(--border-color)', paddingTop: 12, marginTop: 4,
            fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
            lineHeight: 1.8,
          }}>
            联系微信 <strong style={{ color: 'var(--sp-accent)' }}>yjsj1217</strong> 购买激活码
            <br />
            <span style={{ fontSize: 10 }}>
              首次使用赠送 15 天试用 | 机器码仅供授权验证使用
            </span>
          </div>
        </div>
      )}
    </>
  );
};
