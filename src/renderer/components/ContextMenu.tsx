import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const adjustedPosition = useAdjustedPosition(x, y);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      requestAnimationFrame(() => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          onClose();
        }
      });
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const handleContextMenu = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu-overlay"
      style={{
        position: 'fixed',
        left: Math.max(4, adjustedPosition.x),
        top: Math.max(4, adjustedPosition.y),
        background: 'var(--bg-secondary, #2a2a2a)',
        border: '1px solid var(--border-color, rgba(255,255,255,0.12))',
        borderRadius: 10,
        padding: '6px 0',
        zIndex: 999999,
        minWidth: 170,
        maxWidth: 240,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        animation: 'contextMenuIn 0.15s ease-out',
      }}
    >
      {items.map((item, index) => {
        if (item.label === '---') {
          return (
            <div
              key={index}
              style={{
                height: 1,
                background: 'var(--border-color, rgba(255,255,255,0.08))',
                margin: '4px 14px',
              }}
            />
          );
        }

        return (
          <div
            key={index}
            onClick={() => {
              if (!item.disabled && item.onClick) {
                item.onClick();
                onClose();
              }
            }}
            style={{
              padding: '9px 18px',
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.danger ? '#ff4d4f' : 'var(--text-primary, #e0e0e0)',
              opacity: item.disabled ? 0.4 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              fontWeight: item.danger ? 500 : 400,
              transition: 'background 0.15s',
              lineHeight: 1.3,
            }}
            onMouseEnter={(event) => {
              if (!item.disabled) {
                event.currentTarget.style.background = item.danger ? 'rgba(255,77,79,0.1)' : 'rgba(74,158,255,0.1)';
              }
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'transparent';
            }}
          >
            {item.icon && <span style={{ fontSize: 15, flexShrink: 0, display: 'flex', alignItems: 'center' }}>{item.icon}</span>}
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
};

function useAdjustedPosition(x: number, y: number) {
  const menuWidth = 180;
  const menuHeight = 200;
  let adjustedX = x;
  let adjustedY = y;

  if (x + menuWidth > window.innerWidth) adjustedX = x - menuWidth;
  if (y + menuHeight > window.innerHeight) adjustedY = y - menuHeight;

  return { x: adjustedX, y: adjustedY };
}
