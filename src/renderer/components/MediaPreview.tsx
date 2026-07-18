import React, { useState, useEffect, useCallback, useRef } from 'react';

export interface MediaPreviewProps {
  src: string;
  type?: 'image' | 'video' | 'audio';
  onClose: () => void;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({
  src,
  type = 'image',
  onClose,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const positionStart = useRef({ x: 0, y: 0 });

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [src]);

  const handleWheel = useCallback((event: React.WheelEvent) => {
    if (type !== 'image') return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    setScale(current => Math.max(0.1, Math.min(10, current * delta)));
  }, [type]);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (type !== 'image' || scale <= 1) return;
    event.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: event.clientX, y: event.clientY };
    positionStart.current = { ...position };
  }, [type, scale, position]);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: positionStart.current.x + event.clientX - dragStart.current.x,
      y: positionStart.current.y + event.clientY - dragStart.current.y,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (type !== 'image') return;
    setScale(current => current > 1 ? 1 : 2);
    if (scale > 1) setPosition({ x: 0, y: 0 });
  }, [type, scale]);

  const baseMediaStyle: React.CSSProperties = {
    display: 'block',
    maxWidth: type === 'video' ? '85vw' : '90vw',
    maxHeight: type === 'video' ? '85vh' : '90vh',
    objectFit: 'contain',
    borderRadius: 8,
    boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
    userSelect: 'none',
  };

  return (
    <div
      ref={overlayRef}
      className="media-preview-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 99999 }}
      onClick={(event) => {
        if (event.target === overlayRef.current) onClose();
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { if (isDragging) setIsDragging(false); }}
    >
      <div className="media-preview-content" style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div className="media-preview-frame" style={{ position: 'relative', pointerEvents: 'auto' }}>
          <button className="media-preview-close" onClick={onClose} title="关闭预览 (ESC)" aria-label="关闭预览">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>

          {type === 'image' && (
            <img
              src={src}
              alt="预览"
              className="media-preview-media"
              style={{
                ...baseMediaStyle,
                cursor: scale > 1 ? 'grab' : 'default',
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              }}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onDoubleClick={handleDoubleClick}
              draggable={false}
            />
          )}

          {type === 'video' && (
            <video src={src} controls autoPlay className="media-preview-media" style={baseMediaStyle} />
          )}

          {type === 'audio' && (
            <div className="media-preview-audio">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              <audio src={src} controls autoPlay style={{ width: 400, maxWidth: '70vw' }} />
            </div>
          )}
        </div>
      </div>

      {type === 'image' && (
        <div className="media-preview-hint" style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.6)',
          fontSize: 12,
          letterSpacing: 1,
          pointerEvents: 'none',
          zIndex: 100000,
          whiteSpace: 'nowrap',
        }}>
          滚轮缩放 · 双击{scale > 1 ? '重置' : '放大'} · 拖拽移动 · ESC关闭
        </div>
      )}
    </div>
  );
};