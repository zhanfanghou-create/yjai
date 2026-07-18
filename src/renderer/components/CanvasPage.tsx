import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore, CanvasHistory } from '../store/appStore';
import { CheckIcon, EditIcon, DeleteIcon } from './Icons';

const ITEMS_PER_PAGE = 12;


const getCanvasPreviewImage = (canvas: CanvasHistory) => {
  if (canvas.thumbnail) return canvas.thumbnail;
  const nodes = canvas.data?.nodes || {};
  const orderedNodes = Object.values(nodes as Record<string, any>).sort((a: any, b: any) => ((a?.y || 0) - (b?.y || 0)) || ((a?.x || 0) - (b?.x || 0)));
  const imageNode = orderedNodes.find((node: any) => (node?.result?.type === 'image' && node.result.url) || node?.thumbnail || node?.options?.sourceImage || node?.options?.referenceImages?.[0]?.url);
  return imageNode?.result?.type === 'image' && imageNode.result.url
    ? imageNode.result.url
    : imageNode?.thumbnail || imageNode?.options?.sourceImage || imageNode?.options?.referenceImages?.[0]?.url || '';
};

export const CanvasPage: React.FC = () => {
  const {
    canvasHistory,
    activeCanvasId,
    saveCanvas,
    deleteCanvas,
    updateCanvasName,
    loadCanvas,
    setActiveCanvas,
  } = useAppStore();
  
  const [showNewCanvasDialog, setShowNewCanvasDialog] = useState(false);
  const [newCanvasName, setNewCanvasName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  
  // 分页计算
  const totalPages = useMemo(() => Math.max(1, Math.ceil(canvasHistory.length / ITEMS_PER_PAGE)), [canvasHistory]);
  const paginatedCanvases = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return canvasHistory.slice(start, start + ITEMS_PER_PAGE);
  }, [canvasHistory, currentPage]);
  
  // 页码数组
  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 7;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push(-1);
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push(-1);
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push(-1);
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push(-1);
        pages.push(totalPages);
      }
    }
    return pages;
  }, [totalPages, currentPage]);

  // 创建新画布并自动打开
  const handleCreateCanvas = () => {
    if (!newCanvasName.trim()) return;
    const emptyCanvasData = {
      nodes: {},
      camera: { x: 0, y: 0, z: 1 },
    };
    const id = saveCanvas(newCanvasName, emptyCanvasData);
    setNewCanvasName('');
    setShowNewCanvasDialog(false);
    // 自动打开新创建的画布
    setActiveCanvas(id);
    loadCanvas(id);
  };
  
  const startEditing = (canvas: CanvasHistory) => {
    setEditingId(canvas.id);
    setEditName(canvas.name);
  };
  
  const confirmEdit = () => {
    if (editingId && editName.trim()) {
      updateCanvasName(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName('');
  };
  
  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  
  return (
    <div className="canvas-page">
      <div className="canvas-header">
        <h2>画布历史</h2>
        <button
          className="new-canvas-btn"
          onClick={() => setShowNewCanvasDialog(true)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginRight: "6px", verticalAlign: "middle"}}>
            <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          新建画布
        </button>
      </div>
      
      {/* 画布网格 */}
      <div className="canvas-content">
        <div className="canvas-grid">
                  {/* 新建画布方框 */}
        <div
          className="canvas-card-new"
          onClick={() => setShowNewCanvasDialog(true)}
        >
          <div className="new-canvas-icon">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 10V30M10 20H30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="new-canvas-text">新建画布</div>
        </div>

        {paginatedCanvases.map(canvas => {
            const previewImage = getCanvasPreviewImage(canvas);
            return (
            <div
              key={canvas.id}
              className={`canvas-card ${activeCanvasId === canvas.id ? 'active' : ''}`}
              onClick={() => {
                setActiveCanvas(canvas.id);
                loadCanvas(canvas.id);
              }}
            >
              <div className="canvas-thumbnail">
                {previewImage ? (
                  <img src={previewImage} alt={canvas.name} />
                ) : (
              <div className="canvas-placeholder">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginBottom: "8px"}}>
                  <path d="M4 6C4 4.89543 4.89543 4 6 4H26C27.1046 4 28 4.89543 28 6V26C28 27.1046 27.1046 28 26 28H6C4.89543 28 4 27.1046 4 26V6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4 10L10 16L14 12L22 20L28 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="20" cy="12" r="2" fill="currentColor"/>
                </svg>
                <span>无缩略图</span>
              </div>
                )}
              </div>
              
              <div className="canvas-info">
                {editingId === canvas.id ? (
                  <div className="canvas-name-edit">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmEdit();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                    />
                    <button onClick={confirmEdit}><CheckIcon size={14} /></button>
                  </div>
                ) : (
                  <div
                    className="canvas-name"
                    onDoubleClick={() => startEditing(canvas)}
                  >
                    {canvas.name}
                  </div>
                )}
                <div className="canvas-date">{formatDate(canvas.updatedAt)}</div>
              </div>
              
              <div className="canvas-actions">
                <button
                  className="canvas-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditing(canvas);
                  }}
                  title="重命名"
                >
                  <EditIcon size={14} />
                </button>
                <button
                  className="canvas-action-btn delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`确定删除画布"${canvas.name}"？`)) {
                      deleteCanvas(canvas.id);
                    }
                  }}
                  title="删除"
                >
                  <DeleteIcon size={14} />
                </button>
              </div>
            </div>
            );
          })}
        </div>
        
        {/* 分页 */}
        {canvasHistory.length > ITEMS_PER_PAGE && (
          <div className="pagination">
            {currentPage >= 2 && (
              <button
                className="pagination-btn prev"
                onClick={() => setCurrentPage(p => p - 1)}
              >
                ‹ 上一页
              </button>
            )}
            
            <div className="pagination-numbers">
              {pageNumbers.map((num, idx) => (
                num === -1 ? (
                  <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                ) : (
                  <button
                    key={num}
                    className={`pagination-btn number ${num === currentPage ? 'active' : ''}`}
                    onClick={() => setCurrentPage(num)}
                  >
                    {num}
                  </button>
                )
              ))}
            </div>
            
            {currentPage < totalPages && (
              <button
                className="pagination-btn next"
                onClick={() => setCurrentPage(p => p + 1)}
              >
                下一页 ›
              </button>
            )}
          </div>
        )}
        
        {/* 空状态 */}
        {canvasHistory.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 12C8 9.79086 9.79086 8 12 8H52C54.2091 8 56 9.79086 56 12V52C56 54.2091 54.2091 56 52 56H12C9.79086 56 8 54.2091 8 52V12Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 20L20 32L28 24L44 40L56 32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="40" cy="24" r="4" fill="currentColor"/>
              </svg>
            </div>
            <div className="empty-text">暂无画布</div>
            <div className="empty-hint">点击右上角创建你的第一个无限画布</div>
          </div>
        )}
      </div>
      
      {/* 新建画布对话框 */}
      {showNewCanvasDialog && (
        <div
          className="rename-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 99998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeInUp 0.15s ease-out',
          }}
        >
          <div
            className="rename-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary, #2a2a2a)',
              border: '1px solid var(--border-color, rgba(255,255,255,0.12))',
              borderRadius: 16,
              padding: 24,
              minWidth: 280,
              maxWidth: 320,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div style={{ fontSize: 14, color: 'var(--text-secondary, #888)', fontWeight: 500 }}>新建画布</div>
            <input
              type="text"
              value={newCanvasName}
              onChange={(e) => setNewCanvasName(e.target.value)}
              placeholder="输入画布名称"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newCanvasName.trim()) handleCreateCanvas();
                if (e.key === 'Escape') setShowNewCanvasDialog(false);
              }}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'var(--bg-primary, #1a1a1a)',
                border: '1px solid var(--accent-color, #4a9eff)',
                borderRadius: 10,
                color: 'var(--text-primary, #e0e0e0)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
                textAlign: 'center',
              }}
            />
            <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'center' }}>
              <button
                onClick={() => setShowNewCanvasDialog(false)}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color, rgba(255,255,255,0.12))',
                  background: 'transparent',
                  color: 'var(--text-secondary, #888)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >取消</button>
              <button
                onClick={handleCreateCanvas}
                disabled={!newCanvasName.trim()}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: !newCanvasName.trim() ? 'var(--text-secondary, #555)' : 'var(--accent-color, #4a9eff)',
                  color: '#fff',
                  cursor: newCanvasName.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
