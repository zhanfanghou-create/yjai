import React, { useState, useMemo } from 'react';
import { CAMERA_MOVEMENTS, CameraMovement, getCameraMovementImagePath } from '../data/cameraMovements';

interface CameraMovementGalleryProps {
  selectedId: string | null;
  onSelect: (movement: CameraMovement) => void;
  onClose: () => void;
}

export function CameraMovementGallery({ selectedId, onSelect, onClose }: CameraMovementGalleryProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return CAMERA_MOVEMENTS;
    const q = search.trim().toLowerCase();
    return CAMERA_MOVEMENTS.filter(m => m.name.toLowerCase().includes(q) || m.promptEn.toLowerCase().includes(q));
  }, [search]);

  return (
    <div className="camera-movement-overlay" onClick={onClose}>
      <div className="camera-movement-panel nodrag nowheel" onClick={e => e.stopPropagation()}>
        {/* 精简标题栏，搜索框内置 */}
        <div className="camera-movement-header">
          <div className="camera-movement-search-inline">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="camera-movement-search-icon"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
            <input
              type="text"
              className="camera-movement-search-input"
              placeholder="搜索运镜..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <button className="camera-movement-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
          </button>
        </div>

        {/* 运镜网格 - 一行三个，更大更清晰 */}
        <div className="camera-movement-grid">
          {filtered.map(movement => (
            <button
              key={movement.id}
              className={`camera-movement-card ${selectedId === movement.id ? 'selected' : ''}`}
              onClick={() => { onSelect(movement); onClose(); }}
              title={movement.promptZh}
            >
              <div className="camera-movement-preview">
                <img
                  src={getCameraMovementImagePath(movement.imagePath)}
                  alt={movement.name}
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.classList.add('img-missing');
                  }}
                />
                {selectedId === movement.id && (
                  <div className="camera-movement-check">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                  </div>
                )}
              </div>
              <span className="camera-movement-name">{movement.name}</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="camera-movement-empty">未找到匹配的运镜</div>
        )}
      </div>
    </div>
  );
}
