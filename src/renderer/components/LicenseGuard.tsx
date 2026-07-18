import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';

// SVG 图标组件
const ClockIcon: React.FC<{ color?: string; size?: number }> = ({ color = '#ef4444', size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
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

const LoaderIcon: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
  </svg>
);

/**
 * 授权守卫组件
 * 在 App 最外层包裹，检查授权状态
 * 过期时显示全屏遮罩，阻止操作
 */
export const LicenseGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const licenseStatus = useAppStore(s => s.licenseStatus);
  const licenseInfo = useAppStore(s => s.licenseInfo);
  const setLicenseStatus = useAppStore(s => s.setLicenseStatus);

  // 启动时检查授权
  useEffect(() => {
    checkLicense();
    // 每5分钟检查一次
    const interval = setInterval(checkLicense, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const checkLicense = async () => {
    try {
      const mc = await window.yijingAPI?.license?.getMachineCode();
      if (!mc) {
        setLicenseStatus('expired', null);
        setChecking(false);
        return;
      }
      const info = await window.yijingAPI?.license?.getInfo(mc);
      if (info) {
        setLicenseStatus(info.status as any, {
          machineCode: info.machineCode,
          daysLeft: info.daysLeft,
          expiresAt: info.expiresAt,
          activationCode: info.activationCode,
        });
      }
    } catch (e) {
      console.error('License check failed:', e);
      setLicenseStatus('expired', null);
    }
    setChecking(false);
  };

  // 加载中
  if (checking || licenseStatus === 'loading') {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-primary)',
        zIndex: 99999,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, margin: '0 auto 16px',
            color: 'var(--sp-accent)',
            animation: 'spin 1s linear infinite',
          }}>
            <LoaderIcon size={40} />
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>正在验证授权...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // 已过期 - 显示全屏遮罩
  if (licenseStatus === 'expired') {
    return <ExpiredScreen licenseInfo={licenseInfo} onActivate={checkLicense} />;
  }

  // 正常使用
  return <>{children}</>;
};

/**
 * 过期全屏遮罩
 */
const ExpiredScreen: React.FC<{
  licenseInfo: { machineCode?: string } | null;
  onActivate: () => void;
}> = ({ licenseInfo, onActivate }) => {
  const [activationCode, setActivationCode] = useState('');
  const [activating, setActivating] = useState(false);
  const [resultMsg, setResultMsg] = useState('');
  const [resultType, setResultType] = useState<'success' | 'error'>('error');
  const machineCode = licenseInfo?.machineCode || '';

  const handleActivate = async () => {
    if (!activationCode.trim()) return;
    setActivating(true);
    setResultMsg('');
    try {
      const r = await window.yijingAPI?.license?.validate(activationCode.trim(), machineCode);
      if (r?.valid) {
        setResultMsg('激活成功！');
        setResultType('success');
        setTimeout(() => onActivate(), 1000);
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

  const handleCopy = () => {
    navigator.clipboard.writeText(machineCode).then(() => {
      setResultMsg('已复制机器码');
      setResultType('success');
      setTimeout(() => setResultMsg(''), 2000);
    });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f0f13 0%, #1a1a24 100%)',
      zIndex: 99999,
    }}>
      <div style={{
        width: 420,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 16,
        padding: 40,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* 图标 */}
        <div style={{
          width: 64, height: 64, margin: '0 auto 24px',
          background: 'rgba(239,68,68,0.1)', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ClockIcon color="#ef4444" size={32} />
        </div>

        <h2 style={{
          fontSize: 22, fontWeight: 700, textAlign: 'center',
          marginBottom: 8, color: 'var(--text-primary)',
        }}>
          试用已过期
        </h2>

        <p style={{
          textAlign: 'center', color: 'var(--text-secondary)',
          marginBottom: 24, fontSize: 14, lineHeight: 1.6,
        }}>
          您的试用期已结束<br />
          请输入激活码继续使用艺镜AI
        </p>

        {/* 机器码 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: 'block', fontSize: 12, color: 'var(--text-muted)',
            marginBottom: 6, fontWeight: 500,
          }}>
            本机机器码
          </label>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-primary)', padding: '10px 12px',
            borderRadius: 8, border: '1px solid var(--border-color)',
          }}>
            <code style={{
              flex: 1, fontSize: 13, fontFamily: 'monospace',
              color: 'var(--text-primary)', letterSpacing: 1,
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {machineCode || '获取中...'}
            </code>
            {machineCode && (
              <button
                onClick={handleCopy}
                style={{
                  background: 'none', border: '1px solid var(--border-color)',
                  borderRadius: 4, padding: '4px 10px', fontSize: 11,
                  cursor: 'pointer', color: 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <CopyIcon size={12} />复制
              </button>
            )}
          </div>
        </div>

        {/* 激活码输入 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: 'block', fontSize: 12, color: 'var(--text-muted)',
            marginBottom: 6, fontWeight: 500,
          }}>
            激活码
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={activationCode}
              onChange={e => setActivationCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleActivate()}
              placeholder="输入激活码"
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                fontSize: 14, outline: 'none', fontFamily: 'monospace',
              }}
              autoFocus
            />
            <button
              onClick={handleActivate}
              disabled={activating || !activationCode.trim()}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: activating ? 'var(--text-muted)' : 'var(--sp-accent)',
                color: '#fff', cursor: activating ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              {activating ? '验证中...' : '激活'}
            </button>
          </div>
        </div>

        {/* 结果消息 */}
        {resultMsg && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16,
            background: resultType === 'success' ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
            color: resultType === 'success' ? '#34d399' : '#ef4444',
            textAlign: 'center', justifyContent: 'center',
          }}>
            {resultType === 'success' && <CheckIcon color="#34d399" />}
            {resultType === 'error' && <XIcon color="#ef4444" />}
            {resultMsg}
          </div>
        )}

        {/* 底部联系 */}
        <div style={{
          borderTop: '1px solid var(--border-color)', paddingTop: 20, marginTop: 8,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            联系微信 <strong style={{ color: 'var(--sp-accent)' }}>yjsj1217</strong> 购买激活码
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            艺镜AI - AI 无限画布创作工具
          </p>
        </div>
      </div>
    </div>
  );
};
