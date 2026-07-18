import React, { useState, useRef, useEffect } from 'react';
import { LicensePopup } from './LicensePopup';
import { useAppStore, SearchResult } from '../store/appStore';
import { MinimizeIcon, MaximizeIcon, RestoreIcon, CloseIcon } from './Icons';
import logoUrl from '/logo.png';

// 搜索结果类型标签映射
const TYPE_LABELS: Record<string, string> = {
  asset: '资产',
  prompt: '提示词',
  drama: '剧创',
  chat: '对话',
  canvas: '画布',
};

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const searchQuery = useAppStore(s => s.searchQuery);
  const searchResults = useAppStore(s => s.searchResults);
  const setSearchQuery = useAppStore(s => s.setSearchQuery);
  const runGlobalSearch = useAppStore(s => s.runGlobalSearch);
  const clearSearch = useAppStore(s => s.clearSearch);
  const setActiveSection = useAppStore(s => s.setActiveSection);
  const setActiveCanvas = useAppStore(s => s.setActiveCanvas);
  const setActiveSession = useAppStore(s => s.setActiveSession);
  const loadDramaRecord = useAppStore(s => s.loadDramaRecord);

  // 点击外部关闭搜索结果
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      runGlobalSearch();
      setShowResults(true);
    } else {
      setShowResults(false);
    }
  };

  const handleResultClick = (r: SearchResult) => {
    switch (r.type) {
      case 'asset':
        setActiveSection('assets');
        break;
      case 'prompt':
        setActiveSection('prompt-library');
        break;
      case 'drama':
        setActiveSection('drama');
        loadDramaRecord(r.id);
        break;
      case 'chat':
        setActiveSection('home');
        setActiveSession(r.id);
        break;
      case 'canvas':
        setActiveCanvas(r.id);
        setActiveSection('canvas');
        break;
    }
    setShowResults(false);
    clearSearch();
  };

  // 键盘快捷键：Ctrl+K 聚焦搜索
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const input = searchRef.current?.querySelector('input');
        input?.focus();
      }
      if (e.key === 'Escape') {
        setShowResults(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 最小化
  const handleMinimize = () => {
    if (window.yijingAPI && window.yijingAPI.window) {
      window.yijingAPI.window.minimize();
    }
  };

  // 最大化/还原
  const handleMaximize = () => {
    if (window.yijingAPI && window.yijingAPI.window) {
      window.yijingAPI.window.maximize();
      setIsMaximized(!isMaximized);
    }
  };

  // 关闭
  const handleClose = () => {
    if (window.yijingAPI && window.yijingAPI.window) {
      window.yijingAPI.window.close();
    }
  };

  return (
    <div className="title-bar">
      <div className="title-bar-left">
        <img src={logoUrl} alt="艺镜AI" className="title-bar-logo" />
        <div className="title-bar-title">艺镜AI - 让AI创意更简单</div>
      </div>

      {/* 全局搜索框 */}
      <div className="global-search-wrapper" ref={searchRef}>
        <div className="global-search-input-wrapper">
          <svg className="global-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="global-search-input"
            placeholder="搜索资产、提示词、历史... (Ctrl+K)"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
          />
          {searchQuery && (
            <button className="global-search-clear" onClick={() => { clearSearch(); setShowResults(false); }}>
              ✕
            </button>
          )}
        </div>

        {showResults && searchResults.length > 0 && (
          <div className="global-search-results">
            {searchResults.map(r => (
              <div
                key={`${r.type}_${r.id}`}
                className="search-result-item"
                onClick={() => handleResultClick(r)}
              >
                <span className={`result-type-badge result-type-${r.type}`}>
                  {TYPE_LABELS[r.type] || r.type}
                </span>
                <div className="result-content">
                  <span className="result-title">{r.title}</span>
                  {r.snippet && <span className="result-snippet">{r.snippet}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {showResults && searchQuery.trim() && searchResults.length === 0 && (
          <div className="global-search-results">
            <div className="search-result-empty">未找到匹配结果</div>
          </div>
        )}
      </div>

      <div className="title-bar-right">
        <LicensePopup />

        <div className="title-bar-controls">
          <button className="title-bar-btn minimize" onClick={handleMinimize}>
            <MinimizeIcon size={14} />
          </button>
          <button className="title-bar-btn maximize" onClick={handleMaximize}>
            {isMaximized ? <RestoreIcon size={12} /> : <MaximizeIcon size={12} />}
          </button>
          <button className="title-bar-btn close" onClick={handleClose}>
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
