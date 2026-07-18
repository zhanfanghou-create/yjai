/**
 * 全局记忆系统 Hook
 * 统一接口，供所有页面使用
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import {
  useGlobalMemoryStore,
  saveToMemory,
  searchMemory,
  getMemoryRecommendations,
  MemoryEntry,
  MemoryType,
  MemorySource,
  MemorySearchResult,
} from '../store/memoryStore';

// 获取 Hook
export function useMemory() {
  const store = useGlobalMemoryStore();
  
  return {
    // 状态
    memories: store.memories,
    pinnedMemoryIds: store.pinnedMemoryIds,
    recentMemoryIds: store.recentMemoryIds,
    searchHistory: store.searchHistory,
    
    // 操作方法
    save: store.saveMemory,
    update: store.updateMemory,
    remove: store.deleteMemory,  // `delete` 是关键字，用 remove
    get: store.getMemory,
    search: store.search,
    getRecommendations: store.getRecommendations,
    use: store.useMemory,
    pin: store.pinMemory,
    unpin: store.unpinMemory,
    addTag: store.addTag,
    removeTag: store.removeTag,
    import: store.importMemories,
    export: store.exportMemories,
    prune: store.pruneOldMemories,
    getStats: store.getStats,
  };
}

// 快速保存 Hook
export function useQuickSave(type: MemoryType, source: MemorySource) {
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  
  const save = useCallback((
    title: string,
    content: string,
    options?: {
      tags?: string[];
      summary?: string;
      linkedDramas?: string[];
      linkedCharacters?: string[];
      linkedScenes?: string[];
      metadata?: Record<string, any>;
    }
  ) => {
    const entry = saveToMemory(type, source, title, content, options);
    setLastSaved(entry.id);
    return entry;
  }, [type, source]);
  
  return { save, lastSaved };
}

// 智能推荐 Hook
export function useMemoryRecommendations(
  context?: {
    currentSource?: MemorySource;
    currentType?: MemoryType;
    relatedIds?: string[];
  }
) {
  const recommendations = getMemoryRecommendations(context);
  return recommendations;
}

// 搜索 Hook
export function useMemorySearch(options?: {
  types?: MemoryType[];
  sources?: MemorySource[];
  limit?: number;
  fuzzy?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    
    setIsSearching(true);
    const searchResults = searchMemory(query, options);
    setResults(searchResults);
    setIsSearching(false);
  }, [query, JSON.stringify(options)]);
  
  return {
    query,
    setQuery,
    results,
    isSearching,
  };
}

// 记忆详情 Hook
export function useMemoryDetail(memoryId: string | null) {
  const [memory, setMemory] = useState<MemoryEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    if (!memoryId) {
      setMemory(null);
      return;
    }
    
    setIsLoading(true);
    const { getMemory, useMemory } = useGlobalMemoryStore.getState();
    const entry = getMemory(memoryId);
    
    if (entry) {
      setMemory(entry);
      // 记录使用
      useMemory(memoryId, {
        usedIn: entry.source,
        context: '查看详情',
      });
    }
    
    setIsLoading(false);
  }, [memoryId]);
  
  return { memory, isLoading };
}

// 批量操作 Hook
export function useBatchMemory() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const select = useCallback((id: string) => {
    setSelectedIds(prev => new Set([...prev, id]));
  }, []);
  
  const deselect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  
  const toggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  
  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);
  
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);
  
  const deleteSelected = useCallback(() => {
    const state = useGlobalMemoryStore.getState();
    selectedIds.forEach(id => state.deleteMemory(id));
    clearSelection();
  }, [selectedIds, clearSelection]);
  
  const pinSelected = useCallback(() => {
    const { pinMemory } = useGlobalMemoryStore.getState();
    selectedIds.forEach(id => pinMemory(id));
  }, [selectedIds]);
  
  return {
    selectedIds,
    select,
    deselect,
    toggle,
    selectAll,
    clearSelection,
    deleteSelected,
    pinSelected,
    selectedCount: selectedIds.size,
    isSelected: (id: string) => selectedIds.has(id),
  };
}

// 导出类型
export type { MemoryEntry, MemoryType, MemorySource, MemorySearchResult } from '../store/memoryStore';

// ============================================================
// 自动记忆 Hooks - 全软件全功能自动归档
// ============================================================

/**
 * 页面级自动快照 - 覆盖式（每页面 1 条）
 * 页面 mount 时调一次，后续 data 变化时也会重新快照（防抖 5s）
 * 用 JSON.stringify 比较 data，避免每次 render 都触发
 */
export function usePageSnapshot(
  source: MemorySource,
  title: string,
  data: any,
  options?: {
    tags?: string[];
    summary?: string;
    enabled?: boolean; // 默认 true；可传 false 暂时禁用
  }
) {
  const enabled = options?.enabled !== false;
  const lastDataRef = useRef('');
  useEffect(() => {
    if (!enabled) return;
    if (!title) return;
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    if (dataStr === lastDataRef.current) return; // 数据没变，跳过
    lastDataRef.current = dataStr;
    const { autoSnapshot } = useGlobalMemoryStore.getState();
    autoSnapshot({
      source,
      title,
      data,
      tags: options?.tags,
      summary: options?.summary,
    });
  }, [source, title, enabled, data]); // data 是 object，但内部用 ref 比较
}

/**
 * 内容级自动保存 - 独立条目（重要内容/聊天/节点）
 * 依赖变化时自动存档，5min 内同内容去重
 */
export function useContentAutoSave(
  source: MemorySource,
  type: MemoryType,
  title: string,
  content: string,
  options?: {
    tags?: string[];
    metadata?: Record<string, any>;
    linkedDramas?: string[];
    linkedCharacters?: string[];
    linkedScenes?: string[];
    enabled?: boolean;
    debounceMs?: number; // 默认 2000ms
  }
) {
  const enabled = options?.enabled !== false;
  const debounceMs = options?.debounceMs ?? 2000;
  useEffect(() => {
    if (!enabled) return;
    if (!title || !content) return;
    const timer = setTimeout(() => {
      const { autoSaveContent } = useGlobalMemoryStore.getState();
      autoSaveContent({
        source, type, title, content,
        tags: options?.tags,
        metadata: options?.metadata,
        linkedDramas: options?.linkedDramas,
        linkedCharacters: options?.linkedCharacters,
        linkedScenes: options?.linkedScenes,
      });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [source, type, title, content, enabled, debounceMs]);
}

/**
 * 聊天消息自动保存 - 新增消息时触发
 * 用 ref 记录上一条消息数，避免重复保存
 */
export function useChatAutoSave(
  source: MemorySource,
  messages: Array<{ role: string; content: string }>,
  options?: {
    titlePrefix?: string;
    enabled?: boolean;
  }
) {
  const enabled = options?.enabled !== false;
  const lastCountRef = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    if (messages.length <= lastCountRef.current) {
      lastCountRef.current = messages.length;
      return;
    }
    // 只保存新增的消息
    const newMsgs = messages.slice(lastCountRef.current);
    lastCountRef.current = messages.length;
    for (const msg of newMsgs) {
      if (!msg.content || msg.content.length < 5) continue;
      const { autoSaveContent } = useGlobalMemoryStore.getState();
      autoSaveContent({
        source,
        type: 'note',
        title: `${options?.titlePrefix || '对话'}: ${msg.content.slice(0, 30)}`,
        content: msg.content,
        tags: ['chat', msg.role, source],
      });
    }
  }, [messages.length, enabled, source]);
}

// useRef 已在顶部导入
