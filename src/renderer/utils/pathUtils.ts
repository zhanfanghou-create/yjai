export function normalizeFileSrc(p: string | undefined | null) {
  if (!p) return p as any;
  try {
    if (/^https?:\/\//i.test(p) || /^file:\/\//i.test(p)) return p;
    if (/^[a-zA-Z]:[\\\/]/.test(p)) {
      const withForward = p.replace(/\\/g, '/');
      return `file:///${withForward}`;
    }
    return p;
  } catch (e) {
    return p;
  }
}


// 将任意媒体地址（远程 URL / data URL / base64）先下载到本地 assets，返回本地绝对路径。
// 已是本地路径 / file:// 时原样返回；下载失败时回退原始地址，保证不阻断呈现。
export async function localizeMedia(url: string | undefined | null, prefix = 'media', suggestedExt?: string): Promise<string> {
  const src = (url || '').trim();
  if (!src) return src;
  // 本地路径 / file:// 直接返回
  if (/^file:\/\//i.test(src) || /^[a-zA-Z]:[\\/]/.test(src)) return src;
  const api = (window as any)?.yijingAPI?.system?.downloadToAssets;
  if (typeof api !== 'function') return src;
  try {
    const r = await api({ url: src, prefix, suggestedExt });
    return r?.ok && r?.path ? r.path : src;
  } catch {
    return src;
  }
}

export default normalizeFileSrc;
