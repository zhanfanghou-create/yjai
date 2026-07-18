/**
 * 画布记忆 Hook
 * 自动保存画布数据到全局记忆系统
 */

import { useEffect, useCallback, useRef } from 'react';
import { saveToMemory, searchMemory, useGlobalMemoryStore } from '../store/memoryStore';
import { useAppStore } from '../store/appStore';
import type { MemoryType, MemorySource } from '../store/memoryStore';

interface UseCanvasMemoryOptions {
  /** 保存延迟（毫秒），避免频繁保存 */
  saveDelay?: number;
  /** 是否自动保存 */
  autoSave?: boolean;
  /** 保存前的处理函数 */
  beforeSave?: (data: any) => any;
}

export function useCanvasMemory(options: UseCanvasMemoryOptions = {}) {
  const { saveDelay = 3000, autoSave = true, beforeSave } = options;
  
  const {
    activeCanvasId,
    canvasHistory,
    nodes,
  } = useAppStore();
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>('');
  
  // 获取当前画布
  const currentCanvas = canvasHistory.find(c => c.id === activeCanvasId);
  
  // 保存画布到记忆
  const saveToMemorySystem = useCallback(async () => {
    if (!activeCanvasId || !currentCanvas) return;
    
    // 序列化当前画布数据
    const canvasData = JSON.stringify({
      nodes,
      canvas: currentCanvas.data,
      name: currentCanvas.name,
    });
    
    // 检查是否有变化
    if (canvasData === lastSavedRef.current) return;
    lastSavedRef.current = canvasData;
    
    // 处理数据
    const processedData = beforeSave ? beforeSave(canvasData) : canvasData;
    
    // 提取节点内容作为摘要
    const nodeCount = Object.keys(nodes || {}).length;
    const summary = `${currentCanvas.name || '未命名画布'}，${nodeCount} 个节点`;
    
    // 保存到全局记忆（覆盖式快照）
    const store = useGlobalMemoryStore.getState();
    store.autoSnapshot({
      source: 'canvas',
      title: currentCanvas.name || '未命名画布',
      data: processedData,
      tags: ['画布', '自动保存'],
      summary,
    });
    
    console.log(`[CanvasMemory] Saved: ${currentCanvas.name}`);
  }, [activeCanvasId, currentCanvas, nodes, beforeSave]);
  
  // 自动保存
  useEffect(() => {
    if (!autoSave || !activeCanvasId) return;
    
    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // 设置新的定时器
    saveTimeoutRef.current = setTimeout(() => {
      saveToMemorySystem();
    }, saveDelay);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [autoSave, activeCanvasId, nodes, saveDelay, saveToMemorySystem]);
  
  // 搜索画布记忆
  const searchCanvasMemories = useCallback((query: string) => {
    return searchMemory(query, {
      types: ['canvas'],
      limit: 20,
      fuzzy: true,
    });
  }, []);
  
  // 从记忆恢复画布
  const restoreFromMemory = useCallback((memoryId: string) => {
    const { getMemory } = useGlobalMemoryStore.getState();
    const memory = getMemory(memoryId);
    
    if (!memory) {
      console.error('[CanvasMemory] Memory not found:', memoryId);
      return false;
    }
    
    try {
      const data = JSON.parse(memory.content);
      
      // 这里需要调用 appStore 的方法来恢复画布
      const { saveCanvas, setActiveCanvas, loadCanvas } = useAppStore.getState();
      
      // 创建新画布
      const newId = saveCanvas(
        `${memory.title} (恢复)`,
        data.canvas || {},
        data.nodes
      );
      
      // 加载新画布
      loadCanvas(newId);
      
      console.log(`[CanvasMemory] Restored canvas: ${memory.title}`);
      return true;
    } catch (e) {
      console.error('[CanvasMemory] Failed to restore:', e);
      return false;
    }
  }, []);
  
  // 手动保存
  const saveNow = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveToMemorySystem();
  }, [saveToMemorySystem]);
  
  return {
    currentCanvas,
    saveNow,
    searchCanvasMemories,
    restoreFromMemory,
    hasUnsavedChanges: JSON.stringify({ nodes, canvas: currentCanvas?.data }) !== lastSavedRef.current,
  };
}

// 便捷函数：从记忆恢复画布
export async function restoreCanvasFromMemory(memoryId: string, appStore: any) {
  const { getMemory } = useGlobalMemoryStore.getState();
  const memory = getMemory(memoryId);
  
  if (!memory) {
    throw new Error('记忆不存在');
  }
  
  try {
    const data = JSON.parse(memory.content);
    
    // 创建新画布
    const newId = appStore.saveCanvas(
      `${memory.title} (恢复)`,
      data.canvas || {},
      data.nodes
    );
    
    // 加载新画布
    appStore.loadCanvas(newId);
    
    return newId;
  } catch (e) {
    console.error('[CanvasMemory] Failed to restore:', e);
    throw e;
  }
}
