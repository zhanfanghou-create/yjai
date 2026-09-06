import { AssetItem, useAppStore } from '../store/appStore';

export type MediaKind = 'image' | 'video' | 'audio';

export interface LibraryContextTarget {
  kind: 'media' | 'text';
  url?: string;
  mediaType?: MediaKind;
  prompt: string;
  name: string;
  thumbnail?: string;
  tags?: string[];
  sourceId?: string;
  sourceType?: AssetItem['sourceType'];
}

const MEDIA_SELECTOR = 'img, video, audio, [data-media-url], [data-result-url]';
const TEXT_CONTAINER_SELECTOR = '[data-prompt], .message-content, .result-text, .lib-node-inline-text, .lib-node-connected-text, textarea, input';

export function inferMediaType(url: string, fallback: MediaKind = 'image'): MediaKind {
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v|avi|mkv)$/.test(cleanUrl)) return 'video';
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(cleanUrl)) return 'audio';
  if (/\.(png|jpe?g|webp|gif|bmp|svg)$/.test(cleanUrl) || url.startsWith('data:image/')) return 'image';
  return fallback;
}

export function thumbnailForMedia(url: string, type: MediaKind): string | undefined {
  return type === 'image' ? url : undefined;
}

async function generateVideoThumbnail(url: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const cleanup = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    const finish = (thumbnail?: string) => {
      cleanup();
      resolve(thumbnail);
    };

    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';
    video.src = url;

    const timer = window.setTimeout(() => finish(undefined), 3500);

    video.onerror = () => {
      window.clearTimeout(timer);
      finish(undefined);
    };

    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.2, Math.max(0, (video.duration || 1) / 10));
      } catch {
        window.clearTimeout(timer);
        finish(undefined);
      }
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const width = video.videoWidth || 320;
        const height = video.videoHeight || 180;
        const maxWidth = 360;
        const scale = Math.min(1, maxWidth / width);
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas context unavailable');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        window.clearTimeout(timer);
        finish(canvas.toDataURL('image/jpeg', 0.78));
      } catch {
        window.clearTimeout(timer);
        finish(undefined);
      }
    };
  });
}

export async function generateThumbnailForMedia(url: string, type: MediaKind): Promise<string | undefined> {
  if (type === 'image') return url;
  if (type === 'video') return generateVideoThumbnail(url);
  return undefined;
}

export function extractFileName(url: string, fallback: string): string {
  try {
    const clean = decodeURIComponent(url.split('?')[0].split('#')[0]);
    const name = clean.split(/[\\/]/).filter(Boolean).pop();
    return name || fallback;
  } catch {
    return fallback;
  }
}

function promptFromNodeId(nodeId?: string): string {
  if (!nodeId) return '';
  const node = useAppStore.getState().nodes[nodeId];
  return node?.prompt || node?.options?.prompt || node?.result?.text || '';
}

function closestPrompt(element: HTMLElement): string {
  const explicit = element.closest('[data-prompt]') as HTMLElement | null;
  if (explicit?.dataset.prompt) return explicit.dataset.prompt;
  const nodeElement = element.closest('[data-nodeid], [data-id], .react-flow__node') as HTMLElement | null;
  const nodeId = nodeElement?.dataset.nodeid || nodeElement?.dataset.id?.replace(/^workflowNode-/, '');
  const nodePrompt = promptFromNodeId(nodeId);
  if (nodePrompt) return nodePrompt;
  const textContainer = element.closest(TEXT_CONTAINER_SELECTOR) as HTMLInputElement | HTMLTextAreaElement | HTMLElement | null;
  if (textContainer) {
    if ('value' in textContainer && typeof textContainer.value === 'string') return textContainer.value;
    return textContainer.textContent?.trim() || '';
  }
  return window.getSelection()?.toString().trim() || '';
}

export function detectLibraryContextTarget(eventTarget: EventTarget | null): LibraryContextTarget | null {
  const element = eventTarget instanceof HTMLElement ? eventTarget : null;
  const selection = window.getSelection()?.toString().trim() || '';

  if (element) {
    const mediaElement = element.closest(MEDIA_SELECTOR) as HTMLElement | null;
    if (mediaElement) {
      const rawUrl = mediaElement.dataset.mediaUrl || mediaElement.dataset.resultUrl || (mediaElement as HTMLMediaElement).currentSrc || (mediaElement as HTMLImageElement).src || (mediaElement as HTMLMediaElement).src || '';
      if (rawUrl) {
        const tagName = mediaElement.tagName.toLowerCase();
        const mediaType = mediaElement.dataset.mediaType as MediaKind || (tagName === 'video' ? 'video' : tagName === 'audio' ? 'audio' : inferMediaType(rawUrl));
        const prompt = closestPrompt(mediaElement) || extractFileName(rawUrl, '媒体提示词');
        const name = mediaElement.dataset.name || extractFileName(rawUrl, `${mediaType}-asset`);
        return {
          kind: 'media',
          url: rawUrl,
          mediaType,
          prompt,
          name,
          thumbnail: mediaElement.dataset.thumbnail || thumbnailForMedia(rawUrl, mediaType),
          tags: [mediaType === 'image' ? '图片' : mediaType === 'video' ? '视频' : '音频'],
          sourceId: mediaElement.dataset.sourceId,
          sourceType: mediaElement.dataset.sourceType as AssetItem['sourceType'] | undefined,
        };
      }
    }

    const prompt = selection || closestPrompt(element);
    if (prompt) {
      return {
        kind: 'text',
        prompt,
        name: prompt.slice(0, 24) || '文本提示词',
        tags: ['文本'],
      };
    }
  }

  if (selection) {
    return {
      kind: 'text',
      prompt: selection,
      name: selection.slice(0, 24) || '文本提示词',
      tags: ['文本'],
    };
  }

  return null;
}

export async function saveMediaTargetToAssets(target: LibraryContextTarget): Promise<string | null> {
  if (target.kind !== 'media' || !target.url || !target.mediaType) return null;
  const store = useAppStore.getState();
  const existing = Object.values(store.assets).find(asset => asset.path === target.url);
  if (existing) return existing.id;
  const thumbnail = target.thumbnail || await generateThumbnailForMedia(target.url, target.mediaType);
  return store.addAsset({
    name: target.name || extractFileName(target.url, '媒体资产'),
    type: target.mediaType,
    path: target.url,
    thumbnail,
    size: 0,
    sourceId: target.sourceId,
    sourceType: target.sourceType || 'tools',
  });
}
