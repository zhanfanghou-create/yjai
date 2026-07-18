/**
 * 全局记忆面板 (Global Memory Panel) - 简洁版
 * - 浮动图标：卡通猫头鹰（悬停切换大拇指态）
 * - 点击图标：弹出小统计气泡（含帮助入口）
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGlobalMemoryStore, MemoryType, MemorySource } from '../../store/memoryStore';
import memoryIconUrl from '../../assets/memory-icon.png';
import memoryIconHoverUrl from '../../assets/memory-icon-hover.png';
import { CanvasAssistantChat } from './CanvasAssistantChat';

// 记忆类型中文名
const typeNames: Record<MemoryType, string> = {
  drama: '剧创',
  canvas: '画布',
  character: '角色',
  scene: '场景',
  script: '剧本',
  worldbuilding: '世界',
  note: '笔记',
  prompt: '提示词',
  template: '模板',
};

// 尺寸常量
const ICON_W = 64;    // 卡通猫头鹰图标宽度
const ICON_H = 88;    // 卡通猫头鹰图标高度（竖图）

interface GlobalMemoryPanelProps {
  currentSource?: MemorySource;
  onHelpClick?: () => void;
  // 无限画布页：点击猫头鹰进入对话执行指令模式；其它页面仍显示记忆统计
  isCanvasMode?: boolean;
}

export const GlobalMemoryPanel: React.FC<GlobalMemoryPanelProps> = ({
  currentSource = 'other',
  onHelpClick,
  isCanvasMode = false,
}) => {
  const {
    pinnedMemoryIds,
    getStats,
  } = useGlobalMemoryStore();

  // 状态
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>(() => {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    return {
      top: Math.max(16, winH - ICON_H - 24),
      left: Math.max(16, winW - ICON_W - 24),
    };
  });

  // 拖动 ref
  const floatBtnRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const hasDragged = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartOffset = useRef({ top: 0, left: 0 });

  // 加载保存的位置
  useEffect(() => {
    const saved = localStorage.getItem('memoryPanelPosition');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.top === 'number' && typeof parsed?.left === 'number' &&
            parsed.top >= 0 && parsed.left >= 0) {
          setPosition({ top: parsed.top, left: parsed.left });
        }
      } catch {
        localStorage.removeItem('memoryPanelPosition');
      }
    }
  }, []);

  // 拖动中 - 直接操作 DOM
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !floatBtnRef.current) return;

      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;

      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        hasDragged.current = true;
      }

      const newLeft = Math.max(0, Math.min(window.innerWidth - ICON_W, dragStartOffset.current.left + deltaX));
      const newTop = Math.max(0, Math.min(window.innerHeight - ICON_H, dragStartOffset.current.top + deltaY));

      floatBtnRef.current.style.left = `${newLeft}px`;
      floatBtnRef.current.style.top = `${newTop}px`;
      floatBtnRef.current.style.right = 'auto';
      floatBtnRef.current.style.bottom = 'auto';
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;

      if (floatBtnRef.current && hasDragged.current) {
        const rect = floatBtnRef.current.getBoundingClientRect();
        const newPos = { top: rect.top, left: rect.left };
        setPosition(newPos);
        localStorage.setItem('memoryPanelPosition', JSON.stringify(newPos));
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // 拖动开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    isDragging.current = true;
    hasDragged.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };

    if (floatBtnRef.current) {
      const rect = floatBtnRef.current.getBoundingClientRect();
      dragStartOffset.current = { top: rect.top, left: rect.left };
    } else {
      dragStartOffset.current = { top: position.top, left: position.left };
    }
  }, [position]);

  // 点击图标 → 切换小弹窗
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasDragged.current) {
      hasDragged.current = false;
      return;
    }
    // 无限画布页：点击进入对话执行指令；其它页面：显示记忆统计
    if (isCanvasMode) {
      setIsStatsOpen(false);
      setIsChatOpen(prev => !prev);
    } else {
      setIsChatOpen(false);
      setIsStatsOpen(prev => !prev);
    }
  }, [isCanvasMode]);

  // 点击帮助入口
  const handleHelpClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    hasDragged.current = false;
    setIsStatsOpen(false);
    onHelpClick?.();
  }, [onHelpClick]);

  // 点击外部关闭
  useEffect(() => {
    if (!isStatsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.memory-float-btn') && !target.closest('.memory-stats-popover')) {
        setIsStatsOpen(false);
      }
    };
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isStatsOpen]);

  // 离开画布页时，自动关闭对话面板
  useEffect(() => {
    if (!isCanvasMode && isChatOpen) setIsChatOpen(false);
  }, [isCanvasMode, isChatOpen]);

  // 统计数据
  const stats = getStats();
  const pinnedCount = pinnedMemoryIds.length;
  const typeList = (Object.entries(stats.byType) as [MemoryType, number][])
    .filter(([, count]) => count > 0);

  // 弹窗位置：贴在图标上方
  const POPOVER_W = 200;
  const POPOVER_PAD = 8;
  const POPOVER_OFFSET = 10;
  let popoverLeft = position.left + (ICON_W - POPOVER_W) / 2;
  if (popoverLeft < POPOVER_PAD) popoverLeft = POPOVER_PAD;
  if (popoverLeft + POPOVER_W > window.innerWidth - POPOVER_PAD) {
    popoverLeft = window.innerWidth - POPOVER_W - POPOVER_PAD;
  }
  const popoverTop = Math.max(POPOVER_PAD, position.top - 130 - POPOVER_OFFSET);

  return (
    <>
      {/* 浮动按钮：卡通猫头鹰图标 */}
      <div
        ref={floatBtnRef}
        className="memory-float-btn"
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={isCanvasMode ? (isChatOpen ? '点击关闭助手' : '点击与助手对话') : (isStatsOpen ? '点击关闭' : '点击查看记忆统计')}
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: ICON_W,
          height: ICON_H,
          zIndex: 9999,
          cursor: isDragging.current ? 'grabbing' : 'pointer',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        <img
          src={memoryIconUrl}
          alt="记忆"
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: ICON_W,
            height: ICON_H,
            objectFit: 'contain',
            opacity: isHovered || isStatsOpen || isChatOpen ? 0 : 1,
            transition: 'opacity 0.2s',
            pointerEvents: 'none',
          }}
        />
        <img
          src={memoryIconHoverUrl}
          alt="记忆"
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: ICON_W,
            height: ICON_H,
            objectFit: 'contain',
            opacity: isHovered || isStatsOpen || isChatOpen ? 1 : 0,
            transition: 'opacity 0.2s',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* 统计小弹窗（含帮助入口） */}
      {isStatsOpen && (
        <div
          className="memory-stats-popover"
          style={{
            position: 'fixed',
            top: popoverTop,
            left: popoverLeft,
            width: POPOVER_W,
            background: 'var(--bg-primary, #14141a)',
            border: '1px solid var(--border-color, #2a2a30)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            padding: '10px 14px',
            zIndex: 10000,
            fontSize: 12,
            color: 'var(--text-primary, #fff)',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {/* 总数和收藏 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
            fontSize: 13,
          }}>
            <div>
              <span style={{ color: 'var(--accent-color, #6366f1)', fontWeight: 700, fontSize: 16 }}>
                {stats.total}
              </span>
              <span style={{ marginLeft: 4, color: 'var(--text-secondary, #a0a0aa)' }}>
                条记忆
              </span>
            </div>
            <div style={{ color: 'var(--text-secondary, #a0a0aa)', fontSize: 11 }}>
              收藏 <span style={{ color: '#fbbf24', fontWeight: 600 }}>{pinnedCount}</span>
            </div>
          </div>

          {/* 按类型分布 */}
          {typeList.length > 0 ? (
            <div style={{
              paddingTop: 6,
              borderTop: '1px solid var(--border-color, #2a2a30)',
              color: 'var(--text-secondary, #a0a0aa)',
              fontSize: 11,
              lineHeight: 1.6,
            }}>
              {typeList.map(([type, count]) => (
                <span key={type} style={{ marginRight: 10 }}>
                  {typeNames[type] || type}
                  <span style={{ color: 'var(--accent-color, #6366f1)', fontWeight: 600, marginLeft: 3 }}>
                    {count}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <div style={{
              paddingTop: 6,
              borderTop: '1px solid var(--border-color, #2a2a30)',
              color: 'var(--text-muted, #6a6a72)',
              fontSize: 11,
            }}>
              暂无记忆，去别处操作试试
            </div>
          )}

          {/* 帮助入口 */}
          <div
            onClick={handleHelpClick}
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px solid var(--border-color, #2a2a30)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--accent-color, #6366f1)',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'var(--accent-color, #6366f1)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
              }}>?</span>
              使用帮助
            </span>
            <span style={{ fontSize: 11, opacity: 0.6 }}>艺镜AI 助手 →</span>
          </div>
        </div>
      )}

      {/* 无限画布页：对话执行指令面板 */}
      {isChatOpen && isCanvasMode && (
        <CanvasAssistantChat
          anchor={{ top: position.top, left: position.left }}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </>
  );
};

export default GlobalMemoryPanel;
