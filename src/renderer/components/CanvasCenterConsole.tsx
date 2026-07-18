import React, { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useAppStore } from '../store/appStore';

export const CanvasCenterConsole: React.FC<{ onAddNode?: () => void; panOnDrag?: boolean; setPanOnDrag?: (v: boolean) => void }> = ({ onAddNode, panOnDrag, setPanOnDrag }) => {
  const instance = useReactFlow();
  const [gridVisible, setGridVisible] = useState<boolean>(true);
  const { setCanvasGridVisible } = useAppStore();

  const zoomIn = () => { try { instance.zoomIn?.(); } catch (e) { console.warn(e); } };
  const zoomOut = () => { try { instance.zoomOut?.(); } catch (e) { console.warn(e); } };
  const fitView = () => { try { instance.fitView?.(); } catch (e) { console.warn(e); } };
  const resetView = () => { try { instance.setViewport?.({ x: 0, y: 0, zoom: 1 }); } catch (e) { try { instance.setCenter?.(0,0); instance.zoomTo?.(1); } catch (err) { console.warn(err); } } };
  const centerView = () => { try { instance.setCenter?.(0,0); } catch (e) { console.warn(e); } };

  const zoomToSelection = () => {
    try {
      const nodes = instance.getNodes ? instance.getNodes() : [];
      const selected = nodes.filter((n: any) => n.selected);
      if (selected.length === 0) {
        // 未选中任何节点，适应视图
        instance.fitView?.({ padding: 0.1 });
        return;
      }
      instance.fitView?.({ nodes: selected, padding: 0.12 });
    } catch (e) {
      console.warn('zoomToSelection failed', e);
    }
  };

  const toggleGrid = () => {
    const next = !gridVisible;
    setGridVisible(next);
    try { setCanvasGridVisible && setCanvasGridVisible(next); } catch (e) { console.warn(e); }
  };

  const togglePan = () => {
    try {
      const next = !panOnDrag;
      setPanOnDrag && setPanOnDrag(next);
    } catch (e) { console.warn(e); }
  };

  return (
    <div className="canvas-center-console">
      <div className="ccc-row">
        <button title="放大" onClick={zoomIn}>＋</button>
        <button title="缩小" onClick={zoomOut}>－</button>
        <button title="重置视图" onClick={resetView}>⟲</button>
      </div>
      <div className="ccc-row">
        <button title="居中" onClick={centerView}>◎</button>
        <button title="适应屏幕" onClick={fitView}>□</button>
        <button title="选区缩放" onClick={zoomToSelection}>🔍</button>
        <button title="网格" onClick={toggleGrid}>{gridVisible ? '网' : '无'}</button>
      </div>
      <div className="ccc-row">
        <button title="手形平移" onClick={togglePan}>{panOnDrag ? '✋' : '🖐️'}</button>
        <button title="添加节点" onClick={() => onAddNode && onAddNode()}>✦ 添加</button>
      </div>
    </div>
  );
};

export default CanvasCenterConsole;
