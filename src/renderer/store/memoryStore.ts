/**
 * 全局大记忆系统 (Global Memory Store)
 * 支持所有页面:剧创、画布、其他功能页
 * 遵循 OpenClaw/Codex AI 操作习惯
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// 记忆类型
export type MemoryType =
  | 'drama'           // 剧创内容
  | 'canvas'          // 画布内容
  | 'character'       // 角色
  | 'scene'           // 场景
  | 'script'          // 剧本
  | 'worldbuilding'   // 世界观
  | 'note'            // 笔记
  | 'prompt'          // 提示词
  | 'template';       // 模板

// 记忆来源页面
export type MemorySource =
  | 'drama'           // 剧创页面
  | 'canvas'          // 画布页面
  | 'storyboard'      // 分镜页面
  | 'prompt'          // 提示词库
  | 'prompt-library'  // 提示词库(别名)
  | 'settings'        // 设置页
  | 'home'            // 首页
  | 'assets'          // 资产页
  | 'drama-workshop'  // 剧创工坊
  | 'money-printer'   // 印钞机
  | 'tools'           // 工具页
  | 'other';          // 其他

// 记忆条目
export interface MemoryEntry {
  id: string;
  type: MemoryType;
  source: MemorySource;
  title: string;
  content: string;
  summary?: string;        // 自动生成的摘要
  tags: string[];
  createdAt: number;
  updatedAt: number;
  lastAccessedAt?: number;  // 最后访问时间(用于智能推荐)

  // 关联数据
  linkedDramas?: string[];  // 关联的剧创 ID
  linkedCharacters?: string[];
  linkedScenes?: string[];

  // 元数据
  metadata?: {
    episodeIndex?: number;
    sceneIndex?: number;
    characterId?: string;
    [key: string]: any;
  };

  // AI 分析字段
  aiTags?: string[];        // AI 自动提取的标签
  aiContext?: string;      // AI 理解的上下文
  importance?: number;      // 重要性评分 (0-1)
}

// 记忆搜索结果
export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
  matchType: 'title' | 'content' | 'tag' | 'ai';
  highlight?: string;
}

// 记忆使用记录
export interface MemoryUsage {
  memoryId: string;
  usedAt: number;
  usedIn: MemorySource;
  context: string;
}

// 全局记忆状态
interface GlobalMemoryState {
  // 记忆数据
  memories: MemoryEntry[];

  // 使用记录(用于智能推荐)
  usageHistory: MemoryUsage[];

  // 搜索历史
  searchHistory: string[];

  // 当前搜索状态
  isSearching: boolean;
  searchQuery: string;
  searchResults: MemorySearchResult[];

  // 收藏的记忆
  pinnedMemoryIds: string[];

  // 最近使用的记忆
  recentMemoryIds: string[];

  // Actions
  saveMemory: (entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>) => MemoryEntry;
  updateMemory: (id: string, updates: Partial<MemoryEntry>) => void;
  deleteMemory: (id: string) => void;
  getMemory: (id: string) => MemoryEntry | undefined;

  // 搜索
  search: (query: string, options?: {
    types?: MemoryType[];
    sources?: MemorySource[];
    limit?: number;
    fuzzy?: boolean;
  }) => MemorySearchResult[];

  // 智能推荐
  getRecommendations: (context: {
    currentSource?: MemorySource;
    currentType?: MemoryType;
    relatedIds?: string[];
  }) => MemoryEntry[];

  // 使用记忆
  useMemory: (id: string, context: { usedIn: MemorySource; context: string }) => void;

  // 收藏
  pinMemory: (id: string) => void;
  unpinMemory: (id: string) => void;

  // 标签管理
  addTag: (id: string, tag: string) => void;
  removeTag: (id: string, tag: string) => void;

  // 批量操作
  importMemories: (entries: MemoryEntry[]) => void;
  exportMemories: (ids?: string[]) => MemoryEntry[];

  // 自动快照（页面级 - 覆盖式 + 防抖）
  autoSnapshot: (params: {
    source: MemorySource;
    type?: MemoryType; // 可选，默认根据 source 自动映射
    title: string;
    data: any;
    tags?: string[];
    summary?: string;
  }) => MemoryEntry | null;

  // 自动保存(内容节点级 - 独立条目 + 去重)
  autoSaveContent: (params: {
    source: MemorySource;
    type: MemoryType;
    title: string;
    content: string;
    tags?: string[];
    metadata?: Record<string, any>;
    linkedDramas?: string[];
    linkedCharacters?: string[];
    linkedScenes?: string[];
  }) => MemoryEntry | null;

  // 清理
  pruneOldMemories: (keepCount: number) => void;
  _enforceCapacity: () => void;

  // 统计
  getStats: () => {
    total: number;
    byType: Record<MemoryType, number>;
    bySource: Record<MemorySource, number>;
    totalUsage: number;
  };
}

// 生成唯一 ID
const generateMemoryId = () => `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 自动快照防抖 Map:key = `${source}::${title}`,value = last save timestamp
const snapshotDebounceMap = new Map<string, number>();
const SNAPSHOT_DEBOUNCE_MS = 5_000; // 5s 内同 source+title 只存一次

// 内容去重 Map:key = hash(content),value = last save timestamp
const contentHashMap = new Map<string, number>();
const CONTENT_DEDUPE_MS = 5 * 60_000; // 5min 内同 content 跳过

// 容量上限(LRU 淘汰)
const MEMORY_CAPACITY = 200;

// 简单内容 hash(用于去重)
const contentHash = (s: string): string => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(36)}`;
};

// 文本相似度计算(简单实现)
const calculateSimilarity = (str1: string, str2: string): number => {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  // 简单词频比较
  const words1 = new Set(s1.split(/\s+/));
  const words2 = new Set(s2.split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
};

// 创建全局记忆存储
export const useGlobalMemoryStore = create<GlobalMemoryState>()(
  persist(
    (set, get) => ({
      memories: [],
      usageHistory: [],
      searchHistory: [],
      isSearching: false,
      searchQuery: '',
      searchResults: [],
      pinnedMemoryIds: [],
      recentMemoryIds: [],

      saveMemory: (entry) => {
        const now = Date.now();
        const newEntry: MemoryEntry = {
          ...entry,
          id: generateMemoryId(),
          createdAt: now,
          updatedAt: now,
        };

        set(state => ({
          memories: [newEntry, ...state.memories],
        }));

        console.log(`[Memory] Saved: ${newEntry.title} (${newEntry.type})`);
        return newEntry;
      },

      updateMemory: (id, updates) => {
        set(state => ({
          memories: state.memories.map(m =>
            m.id === id ? { ...m, ...updates, updatedAt: Date.now() } : m
          ),
        }));
      },

      deleteMemory: (id) => {
        set(state => ({
          memories: state.memories.filter(m => m.id !== id),
          pinnedMemoryIds: state.pinnedMemoryIds.filter(pid => pid !== id),
          recentMemoryIds: state.recentMemoryIds.filter(rid => rid !== id),
        }));
      },

      getMemory: (id) => {
        return get().memories.find(m => m.id === id);
      },

      search: (query, options) => {
        const state = get();
        const queryLower = query.toLowerCase();
        const results: MemorySearchResult[] = [];

        for (const memory of state.memories) {
          // 类型过滤
          if (options?.types?.length && !options.types.includes(memory.type)) continue;

          // 来源过滤
          if (options?.sources?.length && !options.sources.includes(memory.source)) continue;

          let score = 0;
          let matchType: MemorySearchResult['matchType'] = 'content';

          // 标题匹配(最高权重)
          if (memory.title.toLowerCase().includes(queryLower)) {
            score = 0.9;
            matchType = 'title';
          }
          // 标签匹配
          else if (memory.tags.some(t => t.toLowerCase().includes(queryLower))) {
            score = 0.7;
            matchType = 'tag';
          }
          // AI 标签匹配
          else if (memory.aiTags?.some(t => t.toLowerCase().includes(queryLower))) {
            score = 0.6;
            matchType = 'ai';
          }
          // 内容匹配
          else if (memory.content.toLowerCase().includes(queryLower)) {
            score = 0.5;
            matchType = 'content';
          }
          // 模糊匹配
          else if (options?.fuzzy) {
            const similarity = calculateSimilarity(query, memory.title);
            if (similarity > 0.3) {
              score = similarity * 0.4;
              matchType = 'content';
            }
          }

          if (score > 0) {
            results.push({ entry: memory, score, matchType });
          }
        }

        // 排序:收藏 > 重要性 > 评分 > 最近使用
        results.sort((a, b) => {
          const aPinned = state.pinnedMemoryIds.includes(a.entry.id);
          const bPinned = state.pinnedMemoryIds.includes(b.entry.id);
          if (aPinned && !bPinned) return -1;
          if (!aPinned && bPinned) return 1;

          const aImportance = a.entry.importance || 0.5;
          const bImportance = b.entry.importance || 0.5;
          if (Math.abs(aImportance - bImportance) > 0.1) return bImportance - aImportance;

          return b.score - a.score;
        });

        const limitedResults = options?.limit ? results.slice(0, options.limit) : results;

        // 保存搜索历史
        if (query && !state.searchHistory.includes(query)) {
          set(state => ({
            searchHistory: [query, ...state.searchHistory.slice(0, 19)],
          }));
        }

        return limitedResults;
      },

      getRecommendations: (context) => {
        const state = get();
        const recommendations: { memory: MemoryEntry; score: number }[] = [];

        for (const memory of state.memories) {
          let score = 0;

          // 同类型记忆加分
          if (context.currentType && memory.type === context.currentType) {
            score += 0.3;
          }

          // 同来源记忆加分
          if (context.currentSource && memory.source === context.currentSource) {
            score += 0.2;
          }

          // 关联 ID 加分
          if (context.relatedIds?.length) {
            const hasLink =
              memory.linkedDramas?.some(id => context.relatedIds!.includes(id)) ||
              memory.linkedCharacters?.some(id => context.relatedIds!.includes(id)) ||
              memory.linkedScenes?.some(id => context.relatedIds!.includes(id));
            if (hasLink) score += 0.3;
          }

          // 最近使用加分
          if (memory.lastAccessedAt) {
            const daysSinceAccess = (Date.now() - memory.lastAccessedAt) / (1000 * 60 * 60 * 24);
            if (daysSinceAccess < 7) score += 0.2;
            else if (daysSinceAccess < 30) score += 0.1;
          }

          // 收藏加分
          if (state.pinnedMemoryIds.includes(memory.id)) {
            score += 0.1;
          }

          // 重要性加分
          score += (memory.importance || 0.5) * 0.2;

          if (score > 0.3) {
            recommendations.push({ memory, score });
          }
        }

        return recommendations
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map(r => r.memory);
      },

      useMemory: (id, context) => {
        const now = Date.now();

        set(state => ({
          usageHistory: [
            { memoryId: id, usedAt: now, usedIn: context.usedIn, context: context.context },
            ...state.usageHistory.slice(0, 99) // 只保留最近 100 条
          ],
          recentMemoryIds: [
            id,
            ...state.recentMemoryIds.filter(rid => rid !== id).slice(0, 9)
          ],
          memories: state.memories.map(m =>
            m.id === id ? { ...m, lastAccessedAt: now } : m
          ),
        }));
      },

      pinMemory: (id) => {
        set(state => ({
          pinnedMemoryIds: [...new Set([id, ...state.pinnedMemoryIds])],
        }));
      },

      unpinMemory: (id) => {
        set(state => ({
          pinnedMemoryIds: state.pinnedMemoryIds.filter(pid => pid !== id),
        }));
      },

      addTag: (id, tag) => {
        set(state => ({
          memories: state.memories.map(m =>
            m.id === id && !m.tags.includes(tag)
              ? { ...m, tags: [...m.tags, tag], updatedAt: Date.now() }
              : m
          ),
        }));
      },

      removeTag: (id, tag) => {
        set(state => ({
          memories: state.memories.map(m =>
            m.id === id
              ? { ...m, tags: m.tags.filter(t => t !== tag), updatedAt: Date.now() }
              : m
          ),
        }));
      },

      importMemories: (entries) => {
        set(state => {
          const existingIds = new Set(state.memories.map(m => m.id));
          const newEntries = entries.filter(e => !existingIds.has(e.id));
          return {
            memories: [...newEntries, ...state.memories],
          };
        });
      },

      exportMemories: (ids) => {
        const state = get();
        if (!ids) return state.memories;
        return state.memories.filter(m => ids.includes(m.id));
      },

      pruneOldMemories: (keepCount) => {
        set(state => ({
          memories: state.memories
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, keepCount),
        }));
      },

      // LRU 淘汰:超出容量上限时,删掉最旧的非收藏条目
      _enforceCapacity: () => {
        const state = get();
        if (state.memories.length <= MEMORY_CAPACITY) return;
        const pinned = new Set(state.pinnedMemoryIds);
        const sorted = [...state.memories].sort((a, b) => {
          // 收藏的留在最后
          const aP = pinned.has(a.id) ? 1 : 0;
          const bP = pinned.has(b.id) ? 1 : 0;
          if (aP !== bP) return aP - bP;
          return a.updatedAt - b.updatedAt; // 旧的在前
        });
        const toKeep = sorted.slice(-MEMORY_CAPACITY);
        set({ memories: toKeep });
      },

      // 页面级自动快照 - 覆盖式(防抖 5s)
      autoSnapshot: (params) => {
        const { source, type: paramType, title, data, tags, summary } = params;
        const key = `${source}::${title}`;
        const now = Date.now();
        const last = snapshotDebounceMap.get(key) || 0;
        if (now - last < SNAPSHOT_DEBOUNCE_MS) {
          return null; // 防抖期跳过
        }
        snapshotDebounceMap.set(key, now);

        // 根据 source 自动映射 type（可被 paramType 覆盖）
        const typeMap: Record<MemorySource, MemoryType> = {
          canvas: 'canvas',
          drama: 'drama',
          'drama-workshop': 'drama',
          prompt: 'prompt',
          'prompt-library': 'prompt',
          storyboard: 'script',
          assets: 'character',
          home: 'note',
          settings: 'note',
          'money-printer': 'note',
          tools: 'note',
          other: 'note',
        };
        const finalType = paramType || typeMap[source] || 'note';

        const contentStr = typeof data === 'string' ? data : JSON.stringify(data);
        const state = get();
        // 覆盖式:找同 source+title 的旧条目
        const existing = state.memories.find(m => m.source === source && m.title === title);
        if (existing) {
          set(s => ({
            memories: s.memories.map(m =>
              m.id === existing.id
                ? { ...m, type: finalType, content: contentStr, summary, updatedAt: now, lastAccessedAt: now }
                : m
            ),
          }));
          return existing;
        }
        // 新建
        const entry: MemoryEntry = {
          id: generateMemoryId(),
          type: finalType,
          source,
          title,
          content: contentStr,
          summary,
          tags: tags || ['auto-snapshot', source],
          createdAt: now,
          updatedAt: now,
          lastAccessedAt: now,
        };
        set(s => ({ memories: [entry, ...s.memories] }));
        get()._enforceCapacity();
        return entry;
      },

      // 内容级自动保存 - 独立条目(去重 + LRU)
      autoSaveContent: (params) => {
        const { source, type, title, content, tags, metadata, linkedDramas, linkedCharacters, linkedScenes } = params;
        const hash = contentHash(content);
        const now = Date.now();
        const last = contentHashMap.get(hash) || 0;
        if (now - last < CONTENT_DEDUPE_MS) {
          return null; // 同内容 5min 内跳过
        }
        contentHashMap.set(hash, now);

        const entry: MemoryEntry = {
          id: generateMemoryId(),
          type,
          source,
          title,
          content,
          tags: tags || ['auto-saved', source, type],
          createdAt: now,
          updatedAt: now,
          lastAccessedAt: now,
          metadata,
          linkedDramas,
          linkedCharacters,
          linkedScenes,
          importance: 0.4, // 自动保存默认较低
        };
        set(s => ({ memories: [entry, ...s.memories] }));
        get()._enforceCapacity();
        return entry;
      },

      getStats: () => {
        const state = get();
        const byType: Record<MemoryType, number> = {} as any;
        const bySource: Record<MemorySource, number> = {} as any;

        for (const memory of state.memories) {
          byType[memory.type] = (byType[memory.type] || 0) + 1;
          bySource[memory.source] = (bySource[memory.source] || 0) + 1;
        }

        return {
          total: state.memories.length,
          byType,
          bySource,
          totalUsage: state.usageHistory.length,
        };
      },
    }),
    {
      name: 'yijing-global-memory',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        memories: state.memories,
        pinnedMemoryIds: state.pinnedMemoryIds,
        recentMemoryIds: state.recentMemoryIds,
        searchHistory: state.searchHistory,
      }),
    }
  )
);

// 便捷的保存函数
export const saveToMemory = (
  type: MemoryType,
  source: MemorySource,
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
  return useGlobalMemoryStore.getState().saveMemory({
    type,
    source,
    title,
    content,
    summary: options?.summary,
    tags: options?.tags || [],
    linkedDramas: options?.linkedDramas,
    linkedCharacters: options?.linkedCharacters,
    linkedScenes: options?.linkedScenes,
    metadata: options?.metadata,
  });
};

// 便捷的搜索函数
export const searchMemory = (
  query: string,
  options?: {
    types?: MemoryType[];
    sources?: MemorySource[];
    limit?: number;
    fuzzy?: boolean;
  }
) => {
  return useGlobalMemoryStore.getState().search(query, options);
};

// 获取推荐
export const getMemoryRecommendations = (
  context?: {
    currentSource?: MemorySource;
    currentType?: MemoryType;
    relatedIds?: string[];
  }
) => {
  return useGlobalMemoryStore.getState().getRecommendations(context || {});
};
