/**
 * 素材站服务 (Pexels / Pixabay / 本地)
 * 用于 MoneyPrinter 视频步骤的素材来源
 */

export interface StockMediaItem {
  id: string;
  title: string;
  url: string;          // 下载地址 / 播放地址
  thumbnail: string;    // 缩略图
  duration?: number;    // 时长（秒）
  width: number;
  height: number;
  source: 'pexels' | 'pixabay' | 'local';
  downloadUrl?: string; // 高清下载地址
}

export interface StockMediaSearchOptions {
  query: string;
  perPage?: number;
  page?: number;
  orientation?: 'landscape' | 'portrait' | 'square'; // 横屏/竖屏/方形
  minDuration?: number;  // 最短时长（秒）
  maxDuration?: number;
}

/**
 * 搜索 Pexels 视频
 * API: https://www.pexels.com/api/videos/
 */
export async function searchPexels(
  query: string,
  apiKey: string,
  options: StockMediaSearchOptions = { query: '' }
): Promise<{ ok: boolean; items: StockMediaItem[]; total?: number; error?: string }> {
  if (!apiKey) return { ok: false, items: [], error: '缺少 Pexels API Key' };
  if (!query.trim()) return { ok: true, items: [] };

  try {
    const perPage = options.perPage || 20;
    const page = options.page || 1;
    const orientation = options.orientation || 'landscape';

    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&orientation=${orientation}`;

    const resp = await fetch(url, {
      headers: { Authorization: apiKey },
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, items: [], error: `Pexels 请求失败 (${resp.status}): ${text}` };
    }

    const data = await resp.json();

    const items: StockMediaItem[] = (data.videos || []).map((v: any) => {
      // 找最适合分辨率的 video file
      const files = v.video_files || [];
      const preferred = files.find((f: any) => f.quality === 'hd' || f.quality === 'sd') || files[0];
      const thumb = v.video_pictures?.[0]?.picture || v.image;

      return {
        id: `pexels-${v.id}`,
        title: v.user?.name ? `by ${v.user.name}` : `Pexels #${v.id}`,
        url: preferred?.link || '',
        thumbnail: thumb || '',
        duration: v.duration,
        width: preferred?.width || v.width || 1920,
        height: preferred?.height || v.height || 1080,
        source: 'pexels',
        downloadUrl: preferred?.link,
      };
    });

    return { ok: true, items, total: data.total_results };
  } catch (e: any) {
    return { ok: false, items: [], error: e?.message || String(e) };
  }
}

/**
 * 搜索 Pixabay 视频
 * API: https://pixabay.com/api/docs/#api-video
 */
export async function searchPixabay(
  query: string,
  apiKey: string,
  options: StockMediaSearchOptions = { query: '' }
): Promise<{ ok: boolean; items: StockMediaItem[]; total?: number; error?: string }> {
  if (!apiKey) return { ok: false, items: [], error: '缺少 Pixabay API Key' };
  if (!query.trim()) return { ok: true, items: [] };

  try {
    const perPage = options.perPage || 20;
    const page = options.page || 1;

    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      per_page: String(perPage),
      page: String(page),
      video_type: options.orientation === 'portrait' ? 'vertical' : options.orientation === 'square' ? 'square' : 'film',
    });

    const url = `https://pixabay.com/api/videos/?${params.toString()}`;
    const resp = await fetch(url);

    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, items: [], error: `Pixabay 请求失败 (${resp.status}): ${text}` };
    }

    const data = await resp.json();

    const items: StockMediaItem[] = (data.hits || []).map((h: any) => {
      // Pixabay 返回多个格式：large/small/tiny 等
      const videos = h.videos || {};
      const preferred = videos.medium || videos.large || videos.small || videos.tiny;
      const thumb = h.picture_id
        ? `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg`
        : h.image || '';

      return {
        id: `pixabay-${h.id}`,
        title: h.tags || `Pixabay #${h.id}`,
        url: preferred?.url || '',
        thumbnail: thumb,
        duration: h.duration,
        width: preferred?.width || 1920,
        height: preferred?.height || 1080,
        source: 'pixabay',
        downloadUrl: preferred?.url,
      };
    });

    return { ok: true, items, total: data.totalHits };
  } catch (e: any) {
    return { ok: false, items: [], error: e?.message || String(e) };
  }
}

/**
 * 扫描本地文件夹中的视频文件
 * 前端无法扫描本地文件夹，需要主进程 IPC 支持
 * 这里提供一个接口定义，具体实现通过 window.yijingAPI 调用
 */
export async function scanLocalFolder(
  folderPath: string
): Promise<{ ok: boolean; items: StockMediaItem[]; error?: string }> {
  try {
    const win = window as any;
    if (win?.yijingAPI?.fileSystem?.listFilesFromFolder) {
      const result = await win.yijingAPI.fileSystem.listFilesFromFolder({ folderPath });
      if (result?.ok) {
        const items: StockMediaItem[] = (result.files || []).map((f: any) => ({
          id: `local-${f.path}`,
          title: f.name || f.path.split(/[\\/]/).pop(),
          url: `file://${f.path}`,
          thumbnail: f.thumbnail || '',
          duration: f.duration,
          width: f.width || 1920,
          height: f.height || 1080,
          source: 'local' as const,
        }));
        return { ok: true, items };
      }
      return { ok: false, items: [], error: result?.error || '扫描失败' };
    }
    // Fallback: 返回空（需要主进程支持）
    return { ok: false, items: [], error: '本地文件夹扫描需要主进程支持，请在设置中配置本地素材文件夹路径' };
  } catch (e: any) {
    return { ok: false, items: [], error: e?.message || String(e) };
  }
}

/**
 * 统一搜索入口
 */
export async function searchStockMedia(
  query: string,
  sources: { provider: 'pexels' | 'pixabay' | 'local'; apiKey?: string; folderPath?: string }[],
  options: StockMediaSearchOptions = { query: '' }
): Promise<{ ok: boolean; items: StockMediaItem[]; errors: string[] }> {
  const allItems: StockMediaItem[] = [];
  const errors: string[] = [];

  await Promise.all(
    sources.map(async (src) => {
      if (src.provider === 'pexels') {
        const result = await searchPexels(query, src.apiKey || '', options);
        if (result.ok) allItems.push(...result.items);
        else errors.push(`Pexels: ${result.error}`);
      } else if (src.provider === 'pixabay') {
        const result = await searchPixabay(query, src.apiKey || '', options);
        if (result.ok) allItems.push(...result.items);
        else errors.push(`Pixabay: ${result.error}`);
      } else if (src.provider === 'local') {
        const result = await scanLocalFolder(src.folderPath || '');
        if (result.ok) allItems.push(...result.items);
        else errors.push(`本地: ${result.error}`);
      }
    })
  );

  return { ok: allItems.length > 0 || errors.length === 0, items: allItems, errors };
}
