import React from 'react';

// 极简测试 - 判断 React 是否渲染
export const App: React.FC = () => {
  return (
    <div style={{
      padding: 40,
      color: 'lime',
      background: '#111',
      minHeight: '100vh',
      fontSize: 24,
      fontFamily: 'monospace'
    }}>
      ✅ React 渲染测试成功！<br/><br/>
      如果你看到这行字，说明 React 和构建流程正常。<br/>
      白屏问题是某个组件崩溃导致的。
    </div>
  );
};
