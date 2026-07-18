/**
 * 永久记忆系统
 * 负责保存和查询用户的创作内容、角色、场景、剧本等
 */

// 生成唯一 ID
const generateMemoryId = (type: string) => `mem_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 记忆文件类型
export type MemoryType = 'user' | 'character' | 'scene' | 'script' | 'drama' | 'episode' | 'note';

// 记忆条目基础结构
export interface MemoryEntry {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
  links?: string[]; // 关联的其他记忆 ID
}

// 角色记忆
export interface CharacterMemory extends MemoryEntry {
  type: 'character';
  metadata: {
    age?: string;
    gender?: string;
    role?: string; // 主角/配角/反派等
    personality?: string;
    appearance?: string;
    background?: string;
    characterArc?: string;
  };
  links: string[]; // 关联的场景 ID
}

// 场景记忆
export interface SceneMemory extends MemoryEntry {
  type: 'scene';
  metadata: {
    location?: string;
    time?: string; // 日/夜
    mood?: string;
    characters?: string[]; // 出现的角色名
  };
  links: string[]; // 关联的角色 ID 和剧本 ID
}

// 剧本记忆
export interface ScriptMemory extends MemoryEntry {
  type: 'script';
  metadata: {
    genre?: string;
    episodes?: number;
    totalDuration?: string;
    targetAudience?: string;
  };
  links: string[]; // 关联的角色 ID 和场景 ID
}

// 记忆管理器类
export class MemoryManager {
  private memoryDir: string;
  private cache: Map<string, MemoryEntry> = new Map();
  private indexCache: MemoryEntry[] = [];

  constructor() {
    // 记忆存储在应用的 memory 目录
    this.memoryDir = 'memory';
  }

  // 生成记忆 ID - 使用传入的 type 参数
  private getMemoryId(type: MemoryType): string {
    return generateMemoryId(type);
  }

  // 获取记忆文件路径
  private getMemoryPath(type: MemoryType, id: string): string {
    return `${this.memoryDir}/${type}s/${id}.json`;
  }

  // 保存记忆
  async save(entry: Partial<MemoryEntry> & { type: MemoryType; title: string; content: string }): Promise<MemoryEntry> {
    const now = Date.now();
    const fullEntry: MemoryEntry = {
      id: entry.id || this.getMemoryId(entry.type),
      type: entry.type,
      title: entry.title,
      content: entry.content,
      tags: entry.tags || [],
      createdAt: entry.createdAt || now,
      updatedAt: now,
      metadata: entry.metadata,
      links: entry.links || [],
    };

    // 保存到文件
    const path = this.getMemoryPath(fullEntry.type, fullEntry.id);
    await this.saveToFile(path, fullEntry);

    // 更新缓存
    this.cache.set(fullEntry.id, fullEntry);
    this.updateIndex(fullEntry);

    console.log(`[Memory] Saved ${fullEntry.type}: ${fullEntry.title} (${fullEntry.id})`);
    return fullEntry;
  }

  // 加载记忆
  async load(id: string, type?: MemoryType): Promise<MemoryEntry | null> {
    // 先从缓存查找
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    // 如果没有指定类型，尝试在所有类型中查找
    if (!type) {
      const types: MemoryType[] = ['character', 'scene', 'script', 'drama', 'episode', 'note', 'user'];
      for (const t of types) {
        const entry = await this.load(id, t);
        if (entry) return entry;
      }
      return null;
    }

    const path = this.getMemoryPath(type, id);
    try {
      const entry = await this.loadFromFile<MemoryEntry>(path);
      if (entry) {
        this.cache.set(entry.id, entry);
        this.updateIndex(entry);
      }
      return entry;
    } catch (e) {
      console.error(`[Memory] Failed to load ${id}:`, e);
      return null;
    }
  }

  // 查询记忆
  async search(query: string, options?: {
    type?: MemoryType;
    tags?: string[];
    limit?: number;
  }): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = [];
    const queryLower = query.toLowerCase();

    for (const entry of this.indexCache) {
      // 类型过滤
      if (options?.type && entry.type !== options.type) continue;

      // 标签过滤
      if (options?.tags?.length) {
        const hasTag = options.tags.some(tag => entry.tags.includes(tag));
        if (!hasTag) continue;
      }

      // 关键词匹配
      const matchesTitle = entry.title.toLowerCase().includes(queryLower);
      const matchesContent = entry.content.toLowerCase().includes(queryLower);
      const matchesTags = entry.tags.some(tag => tag.toLowerCase().includes(queryLower));

      if (matchesTitle || matchesContent || matchesTags) {
        results.push(entry);
      }
    }

    // 按更新时间排序
    results.sort((a, b) => b.updatedAt - a.updatedAt);

    // 限制数量
    if (options?.limit) {
      return results.slice(0, options.limit);
    }

    return results;
  }

  // 获取所有记忆
  async getAll(type?: MemoryType): Promise<MemoryEntry[]> {
    if (type) {
      return this.indexCache.filter(e => e.type === type);
    }
    return [...this.indexCache];
  }

  // 删除记忆
  async delete(id: string): Promise<boolean> {
    const entry = this.cache.get(id);
    if (!entry) return false;

    const path = this.getMemoryPath(entry.type, entry.id);
    await this.deleteFile(path);

    this.cache.delete(id);
    this.indexCache = this.indexCache.filter(e => e.id !== id);

    console.log(`[Memory] Deleted ${entry.type}: ${entry.title} (${id})`);
    return true;
  }

  // 获取记忆统计
  getStats(): { total: number; byType: Record<MemoryType, number> } {
    const stats = { total: 0, byType: {} as Record<MemoryType, number> };
    const types: MemoryType[] = ['character', 'scene', 'script', 'drama', 'episode', 'note', 'user'];
    
    for (const type of types) {
      stats.byType[type] = this.indexCache.filter(e => e.type === type).length;
      stats.total += stats.byType[type];
    }

    return stats;
  }

  // 更新索引缓存
  private updateIndex(entry: MemoryEntry): void {
    const existingIndex = this.indexCache.findIndex(e => e.id === entry.id);
    if (existingIndex >= 0) {
      this.indexCache[existingIndex] = entry;
    } else {
      this.indexCache.push(entry);
    }
  }

  // 初始化：加载所有记忆到缓存
  async initialize(): Promise<void> {
    console.log('[Memory] Initializing...');
    const types: MemoryType[] = ['character', 'scene', 'script', 'drama', 'episode', 'note', 'user'];
    
    for (const type of types) {
      await this.loadAllOfType(type);
    }

    const stats = this.getStats();
    console.log(`[Memory] Initialized: ${stats.total} memories loaded`, stats.byType);
  }

  // 加载特定类型的所有记忆
  private async loadAllOfType(type: MemoryType): Promise<void> {
    const win = window as any;
    if (win?.yijingAPI?.memory) {
      const result = await win.yijingAPI.memory.listFiles(`memory/${type}s`);
      if (result?.ok && result.files) {
        for (const file of result.files) {
          if (file.endsWith('.json')) {
            const entry = await this.loadFromFile<MemoryEntry>(`${type}s/${file}`);
            if (entry) {
              this.cache.set(entry.id, entry);
              this.updateIndex(entry);
            }
          }
        }
      }
    }
  }

  // 以下方法需要通过 Electron IPC 调用
  private async saveToFile(filePath: string, data: any): Promise<void> {
    const win = window as any;
    if (win?.yijingAPI?.memory) {
      // 确保目录存在
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      await win.yijingAPI.memory.ensureDir(`memory/${dir}`);
      await win.yijingAPI.memory.writeFile(`memory/${filePath}`, JSON.stringify(data, null, 2));
    }
  }

  private async loadFromFile<T>(filePath: string): Promise<T | null> {
    const win = window as any;
    if (win?.yijingAPI?.memory) {
      const result = await win.yijingAPI.memory.readFile(`memory/${filePath}`);
      if (result?.ok && result.content) {
        return JSON.parse(result.content);
      }
    }
    return null;
  }

  private async deleteFile(filePath: string): Promise<void> {
    const win = window as any;
    if (win?.yijingAPI?.memory) {
      await win.yijingAPI.memory.deleteFile(`memory/${filePath}`);
    }
  }

  // 根据创作步骤保存记忆
  async saveFromStep(
    stepType: 'drama' | 'episode' | 'director' | 'story' | 'script' | 'storyboard' | 'visual' | 'prompt',
    content: string,
    metadata?: Record<string, any>
  ): Promise<MemoryEntry> {
    const titleMap = {
      drama: '剧集概念',
      episode: '分集大纲',
      director: '导演阐述',
      story: '故事创作',
      script: '剧本',
      storyboard: '分镜脚本',
      visual: '视觉资产',
      prompt: '提示词',
    };

    const tagMap = {
      drama: ['剧集概念', '总览'],
      episode: ['分集', '大纲'],
      director: ['导演阐述', '创意'],
      story: ['故事', '叙事'],
      script: ['剧本', '对白'],
      storyboard: ['分镜', '镜头'],
      visual: ['视觉', '美术'],
      prompt: ['提示词', 'AI'],
    };

    return this.save({
      type: 'drama',
      title: titleMap[stepType] || stepType,
      content,
      tags: [...(tagMap[stepType] || []), ...(metadata?.tags || [])],
      metadata,
    });
  }

  // 批量保存角色
  async saveCharacters(characters: Array<{
    name: string;
    age?: string;
    gender?: string;
    role?: string;
    personality?: string;
    appearance?: string;
    background?: string;
    characterArc?: string;
  }>): Promise<CharacterMemory[]> {
    const memories: CharacterMemory[] = [];
    
    for (const char of characters) {
      const memory = await this.save({
        type: 'character',
        title: char.name,
        content: `角色：${char.name}\n年龄：${char.age || '未知'}\n性别：${char.gender || '未知'}\n定位：${char.role || '未知'}\n\n性格：${char.personality || '暂无描述'}\n\n外貌：${char.appearance || '暂无描述'}\n\n背景：${char.background || '暂无描述'}\n\n角色弧光：${char.characterArc || '暂无描述'}`,
        tags: ['角色', char.role || '角色'],
        metadata: char,
      }) as CharacterMemory;
      memories.push(memory);
    }

    return memories;
  }

  // 批量保存场景
  async saveScenes(scenes: Array<{
    title: string;
    location?: string;
    time?: string;
    mood?: string;
    content: string;
    characterNames?: string[];
  }>): Promise<SceneMemory[]> {
    const memories: SceneMemory[] = [];

    for (const scene of scenes) {
      const memory = await this.save({
        type: 'scene',
        title: scene.title,
        content: `场景：${scene.title}\n地点：${scene.location || '未知'}\n时间：${scene.time || '未知'}\n氛围：${scene.mood || '暂无'}\n\n${scene.content}`,
        tags: ['场景', scene.location || '场景'],
        metadata: {
          location: scene.location,
          time: scene.time,
          mood: scene.mood,
          characters: scene.characterNames,
        },
      }) as SceneMemory;
      memories.push(memory);
    }

    return memories;
  }
}

// 导出单例
export const memoryManager = new MemoryManager();
