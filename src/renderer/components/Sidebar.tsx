import React from 'react';
import { useState } from 'react';
import { useAppStore, NavSection } from '../store/appStore';
import logoUrl from '/logo.png';

type ThemeColor = 'dark-gray' | 'light' | 'blue-dark';

// 简洁线条风格 SVG 图标
const Icons = {
  home: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  assets: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  prompt: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  canvas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  ),
  drama: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" />
    </svg>
  ),
  video: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  tools: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  dramaWorkshop: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
      <path d="M12 3v18" />
    </svg>
  ),
  styleWorkshop: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v20" />
      <path d="M2 12h20" />
      <path d="M4.93 4.93l14.14 14.14" />
      <path d="M19.07 4.93L4.93 19.07" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  comfyui: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
    </svg>
  ),
};

export const Sidebar: React.FC = () => {
  const {
    sidebarCollapsed,
    activeSection,
    toggleSidebar,
    setActiveSection,
    setActiveSession,
    activeCanvasId,
    setActiveCanvas,
  } = useAppStore();
  
  const [themeColor, setThemeColor] = useState<ThemeColor>('dark-gray');
  
  // 主菜单项 - 使用简洁线条 SVG 图标
  // 顺序：首页 → 剧创（画布上方）→ 画布 → 资产库/提示词库（画布下方）→ 其余
  const mainMenuItems: { id: NavSection; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: '首页', icon: Icons.home },
    { id: 'drama', label: '剧创', icon: Icons.drama },
    { id: 'canvas', label: '画布', icon: Icons.canvas },
    { id: 'assets', label: '资产', icon: Icons.assets },
    { id: 'prompt-library', label: '提示词库', icon: Icons.prompt },
    { id: 'drama-workshop', label: '剧创工场', icon: Icons.dramaWorkshop },
    { id: 'money-printer', label: '短视频', icon: Icons.video },
    { id: 'tools', label: '工具箱', icon: Icons.tools },
  ];

  // 底部菜单项 - 设置与 ComfyUI，紧挨着收缩菜单（左下方）
  const bottomMenuItems: { id: NavSection; label: string; icon: React.ReactNode }[] = [
    { id: 'settings', label: '设置', icon: Icons.settings },
    { id: 'comfyui', label: 'ComfyUI', icon: Icons.comfyui },
  ];
  
  // 应用主题：优先写入 html，body 存在时同步写入，避免启动阶段 body 为空导致白屏
  const applyTheme = (theme: ThemeColor) => {
    const themeClass = `theme-${theme}`;
    document.documentElement.className = themeClass;
    if (document.body) {
      document.body.className = themeClass;
    }
  };
  
  // 初始化主题（从 localStorage 加载）
  React.useEffect(() => {
    const savedTheme = localStorage.getItem('yijing-theme') as ThemeColor | null;
    const themeMap: Record<string, ThemeColor> = {
      'black': 'dark-gray',
      'white': 'light',
      'dark-gray': 'dark-gray',
      'light': 'light',
      'blue-dark': 'blue-dark',
    };
    const normalizedTheme = savedTheme && themeMap[savedTheme] ? themeMap[savedTheme] : themeColor;
    setThemeColor(normalizedTheme);
    applyTheme(normalizedTheme);
  }, []);
  
  // 切换主题 - 并保存到 localStorage
  const handleThemeChange = (theme: ThemeColor) => {
    setThemeColor(theme);
    applyTheme(theme);
    localStorage.setItem('yijing-theme', theme);
  };
  
  // 导航点击 — 画布模式下先退出画布编辑
  const handleNavClick = (id: NavSection) => {
    if (activeCanvasId) {
      setActiveCanvas(null); // 先关闭当前画布
    }
    
    // 点击「首页」时：清除当前对话选中状态，回到首页空白页
    if (id === 'home') {
      setActiveSession(null);
    }
    
    setActiveSection(id);
  };
  
  return (
    <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!sidebarCollapsed && (
          <>
            <img src={logoUrl} alt="艺镜AI" className="sidebar-logo" />
            <h2>艺镜AI</h2>
          </>
        )}
        {sidebarCollapsed && <img src={logoUrl} alt="艺镜AI" className="sidebar-logo-collapsed" />}
      </div>
      
      <div className="sidebar-menu">
        {mainMenuItems.map(item => (
          <div
            key={item.id}
            className={`menu-item ${activeSection === item.id ? 'active' : ''}`}
            onClick={() => handleNavClick(item.id)}
          >
            <span className="menu-icon">{item.icon}</span>
            {!sidebarCollapsed && (
              <span className="menu-label">{item.label}</span>
            )}
          </div>
        ))}
      </div>
      
      {/* 底部菜单：设置 / ComfyUI —— 紧挨着收缩菜单（左下方） */}
      <div className="sidebar-menu sidebar-menu-bottom">
        {bottomMenuItems.map(item => (
          <div
            key={item.id}
            className={`menu-item ${activeSection === item.id ? 'active' : ''}`}
            onClick={() => handleNavClick(item.id)}
          >
            <span className="menu-icon">{item.icon}</span>
            {!sidebarCollapsed && (
              <span className="menu-label">{item.label}</span>
            )}
          </div>
        ))}
      </div>

      {/* 折叠按钮 - 在菜单下方、主题选择器上方 */}
      <div className="sidebar-collapse-container">
        <button className="sidebar-collapse-btn" onClick={toggleSidebar}>
          <span className="collapse-arrow">{sidebarCollapsed ? '▶' : '◀'}</span>
          {!sidebarCollapsed && <span className="collapse-label">收起侧边栏</span>}
        </button>
      </div>
      
      {/* 主题选择器 - 左下角 */}
      {!sidebarCollapsed && (
        <div className="theme-selector">
          <div className="theme-label">主题颜色</div>
          <div className="theme-options">
          <button
              className={`theme-btn ${themeColor === 'dark-gray' ? 'active' : ''}`}
              onClick={() => handleThemeChange('dark-gray')}
              title="深灰色主题"
            >
              <div className="theme-preview" style={{ backgroundColor: '#2a2a2a' }} />
            </button>
            <button
              className={`theme-btn ${themeColor === 'light' ? 'active' : ''}`}
              onClick={() => handleThemeChange('light')}
              title="浅色主题"
            >
              <div className="theme-preview" style={{ backgroundColor: '#ffffff', border: '1px solid #ddd' }} />
            </button>
            <button
              className={`theme-btn ${themeColor === 'blue-dark' ? 'active' : ''}`}
              onClick={() => handleThemeChange('blue-dark')}
              title="深蓝主题"
            >
              <div className="theme-preview" style={{ backgroundColor: '#0f172a' }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
