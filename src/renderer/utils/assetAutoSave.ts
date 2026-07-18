import { AssetItem, useAppStore } from '../store/appStore';

export const mediaTypeFromMime = (mime = ''): AssetItem['type'] | null => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
};

export const mediaTypeFromUrl = (url = '', fallback: AssetItem['type'] = 'image'): AssetItem['type'] => {
  if (/^data:image\//i.test(url) || /\.(png|jpe?g|gif|webp|svg|bmp)(\?|#|$)/i.test(url)) return 'image';
  if (/^data:video\//i.test(url) || /\.(mp4|webm|mov|avi|mkv)(\?|#|$)/i.test(url)) return 'video';
  if (/^data:audio\//i.test(url) || /\.(mp3|wav|ogg|m4a|flac)(\?|#|$)/i.test(url)) return 'audio';
  return fallback;
};

export const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
  reader.readAsDataURL(file);
});

export const autoSaveMediaToAssets = (input: {
  name: string;
  type: AssetItem['type'];
  path: string;
  size?: number;
  thumbnail?: string;
  sourceId?: string;
  sourceType?: AssetItem['sourceType'];
  folderId?: string;
}) => {
  const store = useAppStore.getState();
  if (!input.path || !['image', 'video', 'audio'].includes(input.type)) return '';
  const exists = Object.values(store.assets || {}).some(asset => asset.path === input.path);
  if (exists) return '';
  return store.addAsset({
    name: input.name || `未命名-${Date.now()}`,
    type: input.type,
    path: input.path,
    thumbnail: input.thumbnail || (input.type === 'image' ? input.path : undefined),
    size: input.size || 0,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    folderId: input.folderId,
  });
};

export const autoSaveFileToAssets = async (file: File, sourceType?: AssetItem['sourceType'], sourceId?: string) => {
  const type = mediaTypeFromMime(file.type);
  if (!type) return '';
  const dataUrl = await fileToDataUrl(file);
  return autoSaveMediaToAssets({ name: file.name, type, path: dataUrl, size: file.size, sourceType, sourceId });
};
