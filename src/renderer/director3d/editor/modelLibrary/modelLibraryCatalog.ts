import mountedPropManifest from "../../../../../public/guo-3d-assets/guo-mounted-props-200/manifest.json";

export type ModelLibraryCategoryId = string;

export type ModelLibraryCategory = {
  id: ModelLibraryCategoryId;
  label: string;
};

export type ModelLibraryItem = {
  categoryId: ModelLibraryCategoryId;
  defaultScale?: number;
  fileName: string;
  id: string;
  name: string;
  thumbUrl?: string;
  url: string;
};

type ManifestCategory = {
  id: string;
  label: string;
  count?: number;
};

type ManifestItem = {
  id: string;
  label?: string;
  categoryId: string;
  categoryLabel?: string;
  modelUrl: string;
  thumbnailUrl?: string;
  localModelPath?: string;
  defaultScale?: number;
};

type MountedPropManifest = {
  categories: ManifestCategory[];
  items: ManifestItem[];
};

const manifest = mountedPropManifest as MountedPropManifest;

// manifest 中的资源路径为绝对路径（如 "/guo-3d-assets/..."），
// 在 Electron（file:// 协议）下绝对路径会被解析到文件系统根目录导致 404。
// 这里统一转换为基于 import.meta.env.BASE_URL 的相对路径，保证 Web 与 Electron 均可访问。
function resolveAssetUrl(rawUrl: string): string {
  if (/^(https?:|data:|blob:)/i.test(rawUrl)) return rawUrl;
  const baseUrl = import.meta.env.BASE_URL || "./";
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = rawUrl.replace(/^\/+/, "");
  return `${normalizedBase}${normalizedPath}`;
}

export const MY_MODELS_CATEGORY_ID: ModelLibraryCategoryId = "my-models";

export const MODEL_LIBRARY_CATEGORIES: ModelLibraryCategory[] = [
  ...manifest.categories.map((category) => ({
    id: category.id,
    label: category.label,
  })),
  { id: MY_MODELS_CATEGORY_ID, label: "我的模型" },
];

export const DEFAULT_MODEL_LIBRARY_CATEGORY_ID: ModelLibraryCategoryId =
  manifest.categories[0]?.id ?? MY_MODELS_CATEGORY_ID;

function fileNameFromUrl(url: string) {
  return url.split("/").pop() ?? url;
}

function createModelName(item: ManifestItem, fileName: string) {
  if (item.label && item.label.trim().length > 0) return item.label;

  return fileName
    .replace(/\.(fbx|obj|glb|gltf)$/i, "")
    .replace(/^\d+_/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

let cachedItems: ModelLibraryItem[] | null = null;

export function getModelLibraryItems(): ModelLibraryItem[] {
  if (cachedItems) return cachedItems;

  cachedItems = manifest.items
    .map((item) => {
      const fileName = fileNameFromUrl(item.localModelPath ?? item.modelUrl);
      const name = createModelName(item, fileName);

      return {
        categoryId: item.categoryId,
        fileName,
        id: item.id,
        name,
        url: resolveAssetUrl(item.modelUrl),
        ...(item.thumbnailUrl ? { thumbUrl: resolveAssetUrl(item.thumbnailUrl) } : {}),
        ...(typeof item.defaultScale === "number" ? { defaultScale: item.defaultScale } : {}),
      } satisfies ModelLibraryItem;
    })
    .sort((a, b) => {
      const categoryIndexA = MODEL_LIBRARY_CATEGORIES.findIndex((category) => category.id === a.categoryId);
      const categoryIndexB = MODEL_LIBRARY_CATEGORIES.findIndex((category) => category.id === b.categoryId);

      if (categoryIndexA !== categoryIndexB) return categoryIndexA - categoryIndexB;

      return a.name.localeCompare(b.name);
    });

  return cachedItems;
}