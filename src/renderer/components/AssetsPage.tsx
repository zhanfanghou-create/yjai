import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore, AssetItem, AssetFolder } from '../store/appStore';
import { normalizeFileSrc } from '../utils/pathUtils';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { SaveToPromptLibraryModal } from './SaveToPromptLibraryModal';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './AssetsPage.css';
import { SaveIcon, CopyIcon, ScissorsIcon, EditIcon, TrashIcon, PinIcon, BookIcon, UploadIcon, CloseIcon, VideoIcon, MusicIcon, FileIcon, PackageIcon } from './Icons';

const ITEMS_PER_PAGE = 12;

export const AssetsPage: React.FC = () => {
  const {
    assets,
    assetFolders,
    selectedFolderId,
    setSelectedFolderId,
    chatSessions,
    canvasHistory,
    addAsset,
    deleteAsset,
    createFolder,
    moveAssetToFolder,
    copyAsset,
    copyFolder,
    deleteFolder,
  } = useAppStore();

  const [currentPage, setCurrentPage] = useState(1);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [saveToPromptModal, setSaveToPromptModal] = useState<{
    isOpen: boolean;
    prompt: string;
    name: string;
    thumbnail?: string;
    sourceType: 'text' | 'image' | 'video';
  }>({
    isOpen: false,
    prompt: '',
    name: '',
    sourceType: 'text',
  });
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [clipboard, setClipboard] = useState<{ id: string; type: 'asset' | 'folder'; action: 'copy' | 'cut' } | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{ assetId: string; src: string; type: 'image' | 'video' | 'audio' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processedAssetsRef = useRef<Set<string>>(new Set());

  // 说明：此前这里有一个"自动分组"副作用，会把带来源信息（sourceId/sourceType）的
  // 自动保存资产移动进自动创建的文件夹里。但资产页已改为扁平展示、不再渲染文件夹入口，
  // 结果导致这些自动保存的资产被移进看不见的文件夹而"消失"。
  // 现移除该自动分组逻辑：所有资产统一在扁平列表中展示，只有在资产页手动删除才会真正移除。


  // ============ 自动分组逻辑 ============
  // 获取所有有来源的资产自动创建的文件夹（按来源名称分组）
  const autoFolders = useMemo(() => {
    const sourceMap: Record<string, AssetFolder> = {};
    Object.values(assetFolders).forEach(folder => {
      if (folder.autoCreated) {
        sourceMap[folder.sourceId || folder.id] = folder;
      }
    });
    return sourceMap;
  }, [assetFolders]);

  // 手动创建的文件夹（无来源的）
  const manualFolders = useMemo(() => {
    return Object.values(assetFolders).filter(f => !f.autoCreated && !f.parentId);
  }, [assetFolders]);

  // ============ 视图管理 ============
  // 当前展示的内容：文件夹列表 或 当前文件夹的资产
  const displayFolders = useMemo(() => {
    if (selectedFolderId === 'root' || !selectedFolderId) {
      // 根目录显示所有文件夹
      return Object.values(assetFolders).filter(f => !f.parentId);
    }
    return Object.values(assetFolders)
      .filter(f => f.parentId === selectedFolderId)
      .map(id => typeof id === 'string' ? assetFolders[id] : id);
  }, [selectedFolderId, assetFolders]);

  // 当前文件夹的资产
  const currentAssets = useMemo(() => {
    if (!selectedFolderId || selectedFolderId === 'root') {
      // 扁平展示：根目录显示所有资产（不再按 folderId 隐藏）。
      // 各页面（工具/画布/对话）自动保存的资产始终可见，只有在资产页删除才真正移除。
      return Object.values(assets).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    const folder = assetFolders[selectedFolderId];
    if (!folder) return [];
    return folder.items.map(id => assets[id]).filter(Boolean);
  }, [assets, assetFolders, selectedFolderId]);

  // 分页计算
  const totalPages = Math.max(1, Math.ceil(currentAssets.length / ITEMS_PER_PAGE));
  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return currentAssets.slice(start, start + ITEMS_PER_PAGE);
  }, [currentAssets, currentPage]);

  // 页码数组（最多显示7个数字）
  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 7;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push(-1); // 省略号
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push(-1);
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push(-1);
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push(-1);
        pages.push(totalPages);
      }
    }
    return pages;
  }, [totalPages, currentPage]);

  // 切换文件夹时重置分页
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFolderId]);

  // ============ 右键菜单处理 ============
  
  const handleContextMenuForFolder = (e: React.MouseEvent, folder: AssetFolder) => {
    e.preventDefault();
    e.stopPropagation();
    
    const items: ContextMenuItem[] = [
      {
        label: '另存为...',
        icon: <SaveIcon size={14} />,
        onClick: async () => {
          // 获取文件夹内所有资产（含子文件夹）并打包为ZIP下载
          const zip = new JSZip();
          const folderZip = zip.folder(folder.name);
          let fileCount = 0;
          
          // 递归收集文件夹中所有资产
          const collectAssets = async (folderId: string, zipFolder: JSZip | null) => {
            const f = assetFolders[folderId];
            if (!f) return;
            
            // 收集当前文件夹的资产
            for (const assetId of (f.items || [])) {
              const asset = assets[assetId];
              if (!asset) continue;
              try {
                // 对于远程 URL 使用 fetch；对于本地 file:// 或绝对路径或 data: 使用主进程读取为 Data URL
                const p = asset.path || '';
                if (/^https?:\/\//i.test(p)) {
                  const response = await fetch(p);
                  const blob = await response.blob();
                  if (zipFolder) zipFolder.file(asset.name, blob);
                  else zip.file(asset.name, blob);
                  fileCount++;
                } else {
                  // 请求主进程读取为 data URL
                  // @ts-ignore
                  const res = await window.yijingAPI.system.readFileAsDataUrl(p);
                  if (res && res.ok && res.dataUrl) {
                    const dataUrl: string = res.dataUrl;
                    const idx = dataUrl.indexOf(',');
                    const base64 = dataUrl.slice(idx + 1);
                    if (zipFolder) zipFolder.file(asset.name, base64, { base64: true });
                    else zip.file(asset.name, base64, { base64: true });
                    fileCount++;
                  } else {
                    console.error(`读取资产 ${asset.name} 失败: ${res?.error}`);
                  }
                }
              } catch (err) {
                console.error(`获取资产 ${asset.name} 失败:`, err);
              }
            }
            
            // 递归处理子文件夹
            for (const childId of (f.children || [])) {
              const childFolder = assetFolders[childId];
              if (childFolder) {
                const childZip = zipFolder ? zipFolder.folder(childFolder.name) : zip.folder(childFolder.name);
                await collectAssets(childId, childZip);
              }
            }
          };
          
          await collectAssets(folder.id, folderZip);
          
          if (fileCount === 0) {
            alert('文件夹为空，无法保存');
            return;
          }
          
          try {
            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, `${folder.name}.zip`);
          } catch (err) {
            console.error('生成ZIP失败:', err);
            alert('无法生成压缩包');
          }
        },
      },
      { label: '---' },
      {
        label: '复制',
        icon: <CopyIcon size={14} />,
        onClick: () => {
          setClipboard({ type: 'folder', id: folder.id, action: 'copy' });
        },
      },
      {
        label: '剪切',
        icon: <ScissorsIcon size={14} />,
        onClick: () => {
          setClipboard({ type: 'folder', id: folder.id, action: 'cut' });
        },
      },
      {
        label: '重命名',
        icon: <EditIcon size={14} />,
        onClick: () => {
          setRenamingId(folder.id);
          setRenameValue(folder.name);
          setContextMenu(null);
        },
      },
      {
        label: '删除',
        icon: <TrashIcon size={14} />,
        danger: true,
        onClick: () => {
          if (confirm(`确定要删除文件夹 "${folder.name}" 吗？`)) {
            deleteFolder(folder.id);
          }
        },
      },
    ];
    
    // 如果有剪贴板内容，添加粘贴选项
    if (clipboard) {
      items.splice(2, 0, {
        label: '粘贴',
        icon: <PinIcon size={14} />,
        onClick: () => {
          if (clipboard!.type === 'asset') {
            if (clipboard!.action === 'copy') {
              // 复制：创建副本
              copyAsset(clipboard!.id, folder.id);
            } else {
              // 剪切：移动
              moveAssetToFolder(clipboard!.id, folder.id);
            }
          } else if (clipboard!.type === 'folder' && clipboard!.id !== folder.id) {
            if (clipboard!.action === 'copy') {
              // 复制：创建文件夹副本
              copyFolder(clipboard!.id, folder.id);
            } else {
              // 剪切：移动文件夹
              const folderData = assetFolders[clipboard!.id];
              if (folderData) {
                useAppStore.setState({
                  assetFolders: {
                    ...assetFolders,
                    [clipboard!.id]: {
                      ...folderData,
                      parentId: folder.id,
                    },
                    [folder.id]: {
                      ...assetFolders[folder.id],
                      children: [...(assetFolders[folder.id]?.children || []), clipboard!.id],
                    },
                  },
                });
              }
            }
          }
          // 如果是剪切，清空剪贴板
          if (clipboard!.action === 'cut') {
            setClipboard(null);
          }
        },
      });
    }
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items,
    });
  };
  
  const handleContextMenuForAsset = (e: React.MouseEvent, asset: AssetItem) => {
    e.preventDefault();
    e.stopPropagation();
    
    const items: ContextMenuItem[] = [
      {
        label: '另存为...',
        icon: <SaveIcon size={14} />,
        onClick: async () => {
          try {
            // 使用主进程读取并弹出保存对话框进行保存
            // @ts-ignore
            const readRes = await window.yijingAPI.system.readFileAsDataUrl(asset.path);
            if (!readRes || !readRes.ok) {
              alert('无法读取文件以保存: ' + (readRes?.error || 'unknown'));
              return;
            }
            const dataUrl: string = readRes.dataUrl;
            // @ts-ignore
            const saveRes = await window.yijingAPI.system.saveFileFromData({ dataUrl, suggestedName: asset.name });
            if (!saveRes || !saveRes.ok) {
              if (saveRes && saveRes.canceled) return; // 用户取消
              alert('保存失败: ' + (saveRes?.error || 'unknown'));
            }
          } catch (err) {
            console.error('另存为失败:', err);
            alert('无法保存文件');
          }
        },
      },
      { label: '---' },
      {
        label: '复制',
        icon: <CopyIcon size={14} />,
        onClick: () => {
          setClipboard({ type: 'asset', id: asset.id, action: 'copy' });
        },
      },
      {
        label: '剪切',
        icon: <ScissorsIcon size={14} />,
        onClick: () => {
          setClipboard({ type: 'asset', id: asset.id, action: 'cut' });
        },
      },
      {
        label: '重命名',
        icon: <EditIcon size={14} />,
        onClick: () => {
          setRenamingId(asset.id);
          setRenameValue(asset.name);
          setContextMenu(null);
        },
      },
      {
        label: '删除',
        icon: <TrashIcon size={14} />,
        danger: true,
        onClick: () => {
          if (confirm(`确定要删除资产 "${asset.name}" 吗？`)) {
            deleteAsset(asset.id);
          }
        },
      },
      { label: '---' },
      {
        label: '存入提示词库',
        icon: <BookIcon size={14} />,
        onClick: () => {
          const sourceType = asset.type === 'video' ? 'video' : asset.type === 'image' ? 'image' : 'text';
          setSaveToPromptModal({
            isOpen: true,
            prompt: asset.name || '',
            name: asset.name || '',
            thumbnail: asset.thumbnail || asset.path,
            sourceType,
          });
        },
      },
    ];
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items,
    });
  };
  
  // ============ 事件处理 ============
  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    createFolder(newFolderName, selectedFolderId === 'root' ? undefined : (selectedFolderId ?? undefined));                                                                                               
    setNewFolderName('');
    setShowNewFolderInput(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setUploadFiles(Array.from(e.target.files));
      setShowUploadDialog(true);
    }
  };

  const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });

  const getAssetDataUrl = async (asset: AssetItem): Promise<string> => {
    const src = asset.path || '';
    if (src.startsWith('data:')) return src;

    if (/^https?:\/\//i.test(src)) {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`下载失败: ${response.status}`);
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error || new Error('远程文件读取失败'));
        reader.readAsDataURL(blob);
      });
    }

    // @ts-ignore
    const readRes = await window.yijingAPI?.system?.readFileAsDataUrl?.(src);
    if (!readRes || !readRes.ok || !readRes.dataUrl) {
      throw new Error(readRes?.error || '无法读取文件');
    }
    return readRes.dataUrl;
  };

  const saveAssetAs = async (asset: AssetItem) => {
    try {
      const dataUrl = await getAssetDataUrl(asset);
      // @ts-ignore
      const saveRes = await window.yijingAPI?.system?.saveFileFromData?.({ dataUrl, suggestedName: asset.name });
      if (!saveRes || !saveRes.ok) {
        if (saveRes && saveRes.canceled) return;
        alert('保存失败: ' + (saveRes?.error || 'unknown'));
      }
    } catch (err) {
      console.error('另存为失败:', err);
      alert('无法保存文件');
    }
  };

  const copyAssetFromPreview = async (asset: AssetItem) => {
    setClipboard({ type: 'asset', id: asset.id, action: 'copy' });

    try {
      const dataUrl = await getAssetDataUrl(asset);
      if (asset.type === 'image' && navigator.clipboard && 'write' in navigator.clipboard) {
        const blob = await (await fetch(dataUrl)).blob();
        const ClipboardItemCtor = (window as any).ClipboardItem;
        if (ClipboardItemCtor && blob.type.startsWith('image/')) {
          await navigator.clipboard.write([new ClipboardItemCtor({ [blob.type]: blob })]);
          return;
        }
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(asset.path);
      }
    } catch (err) {
      console.warn('系统剪贴板复制失败，已复制到资产库内部剪贴板:', err);
    }
  };

  const importClipboardFile = async (file: File) => {
    const assetType = file.type.startsWith('image/') ? 'image' :
                     file.type.startsWith('video/') ? 'video' :
                     file.type.startsWith('audio/') ? 'audio' : 'document';
    const dataUrl = await fileToDataUrl(file);
    addAsset({
      name: file.name || `clipboard-${Date.now()}`,
      type: assetType,
      path: dataUrl,
      size: file.size,
      folderId: selectedFolderId === 'root' ? undefined : (selectedFolderId || undefined),
    });
  };

  const handlePreviewContextMenu = (e: React.MouseEvent, asset: AssetItem) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: '复制',
          icon: <CopyIcon size={14} />,
          onClick: () => {
            void copyAssetFromPreview(asset);
          },
        },
        {
          label: '粘贴',
          icon: <PinIcon size={14} />,
          onClick: () => {
            void pasteAssetToCurrentFolder();
          },
        },
        { label: '---' },
        {
          label: '另存为...',
          icon: <SaveIcon size={14} />,
          onClick: () => {
            void saveAssetAs(asset);
          },
        },
      ],
    });
  };

  const pasteAssetToCurrentFolder = async () => {
    try {
      if (navigator.clipboard?.read) {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          const supportedType = item.types.find(type => type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/'));
          if (supportedType) {
            const blob = await item.getType(supportedType);
            const ext = supportedType.split('/')[1] || 'bin';
            const file = new File([blob], `clipboard-${Date.now()}.${ext}`, { type: supportedType });
            await importClipboardFile(file);
            return;
          }
        }
      }

      if (clipboard?.type === 'asset') {
        const targetFolderId = selectedFolderId === 'root' ? undefined : (selectedFolderId ?? undefined);
        if (clipboard.action === 'copy') {
          copyAsset(clipboard.id, targetFolderId);
        } else {
          moveAssetToFolder(clipboard.id, targetFolderId);
          setClipboard(null);
        }
        return;
      }

      if (navigator.clipboard?.readText) {
        const text = (await navigator.clipboard.readText()).trim();
        if (/^(data:|https?:\/\/|file:\/\/)/i.test(text)) {
          const type: AssetItem['type'] =
            /\.(mp4|webm|mov|avi|mkv)(\?|#|$)/i.test(text) ? 'video' :
            /\.(mp3|wav|ogg|m4a|flac)(\?|#|$)/i.test(text) ? 'audio' :
            /\.(png|jpe?g|gif|webp|svg|bmp)(\?|#|$)/i.test(text) || text.startsWith('data:image/') ? 'image' :
            'document';
          addAsset({
            name: `clipboard-${Date.now()}`,
            type,
            path: text,
            size: 0,
            folderId: selectedFolderId === 'root' ? undefined : (selectedFolderId || undefined),
          });
          return;
        }
      }

      alert('剪贴板中没有可粘贴的媒体文件或资产');
    } catch (err) {
      console.error('粘贴失败:', err);
      alert('无法读取剪贴板内容');
    }
  };

  const confirmUpload = async () => {
    for (const file of uploadFiles) {
      const assetType = file.type.startsWith('image/') ? 'image' :
                       file.type.startsWith('video/') ? 'video' :
                       file.type.startsWith('audio/') ? 'audio' : 'document';
      
      const dataUrl = await fileToDataUrl(file);
      
      addAsset({
        name: file.name,
        type: assetType,
        path: dataUrl,
        size: file.size,
        folderId: selectedFolderId === 'root' ? undefined : (selectedFolderId || undefined),
      });
    }
    
    setUploadFiles([]);
    setShowUploadDialog(false);
  };

  // ============ 渲染 ============
  // 内联重命名处理
  const confirmRename = () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    const newName = renameValue.trim();
    
    // 判断是文件还是文件夹
    if (assets[renamingId]) {
      useAppStore.setState({
        assets: {
          ...assets,
          [renamingId]: { ...assets[renamingId], name: newName },
        },
      });
    } else if (assetFolders[renamingId]) {
      useAppStore.setState({
        assetFolders: {
          ...assetFolders,
          [renamingId]: { ...assetFolders[renamingId], name: newName },
        },
      });
    }
    setRenamingId(null);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') confirmRename();
    if (e.key === 'Escape') cancelRename();
  };

  // 页面空白处右键菜单
  const handlePageContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const items: ContextMenuItem[] = [];
    
    // 如果有剪贴板内容，添加粘贴选项
    if (clipboard) {
      items.push({
        label: '粘贴',
        icon: <PinIcon size={14} />,
        onClick: () => {
          const c = clipboard;
          const targetFolderId = selectedFolderId === 'root' ? undefined : (selectedFolderId ?? undefined);
          if (c.type === 'asset') {
            if (c.action === 'copy') {
              copyAsset(c.id, targetFolderId);
            } else {
              moveAssetToFolder(c.id, targetFolderId);
            }
            if (c.action === 'cut') setClipboard(null);
          } else if (c.type === 'folder') {
            if (c.action === 'copy') {
              copyFolder(c.id, targetFolderId);
            } else {
              moveAssetToFolder(c.id, targetFolderId);
            }
            if (c.action === 'cut') setClipboard(null);
          }
        },
      });
    }
    
    if (items.length > 0) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items,
      });
    }
  };

  return (
    <div className="assets-page" onContextMenu={handlePageContextMenu}>
      <div className="assets-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box' }}>
        <h2 style={{ margin: 0, flex: '0 0 auto' }}>资产库</h2>
        <div className="assets-actions" style={{ flex: '0 0 auto', marginLeft: 'auto' }}>
          <button onClick={() => fileInputRef.current?.click()}>
            <UploadIcon size={16} /> 上传
          </button>
          {/* 树形/文件夹导航被移除：保留上传按钮，隐藏新建文件夹功能以简化 UX */}
        </div>
      </div>
      
      {/* 树形导航已移除：界面采用扁平资产展示，保持现有资产网格 */}
      
      {/* 新建文件夹弹窗 */}
      {showNewFolderInput && (
        <div
          className="rename-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 99998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeInUp 0.15s ease-out',
          }}
        >
            <div
              className="rename-dialog"
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--bg-secondary, #2a2a2a)',
                border: '1px solid var(--border-color, rgba(255,255,255,0.12))',
                borderRadius: 16,
                padding: 24,
                minWidth: 280,
                maxWidth: 320,
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
              }}
            >
            <div style={{ fontSize: 14, color: 'var(--text-secondary, #888)', fontWeight: 500 }}>新建文件夹</div>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="文件夹名称"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') setShowNewFolderInput(false);
              }}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'var(--bg-primary, #1a1a1a)',
                border: '1px solid var(--accent-color, #4a9eff)',
                borderRadius: 10,
                color: 'var(--text-primary, #e0e0e0)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
                textAlign: 'center',
              }}
            />
            <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'center' }}>
              <button
                onClick={() => setShowNewFolderInput(false)}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color, rgba(255,255,255,0.12))',
                  background: 'transparent',
                  color: 'var(--text-secondary, #888)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >取消</button>
              <button
                onClick={handleCreateFolder}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--accent-color, #4a9eff)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >确认</button>
            </div>
          </div>
        </div>
      )}
      
      {/* 文件夹网格已移除，直接展示扁平资产列表 */}
      
       {/* 资产网格 + 分页 */}
       <div className="assets-content">
         <div className="assets-grid">
           {paginatedAssets.map(asset => (
             <div
               key={asset.id}
               className="asset-card"
               onClick={() => {
                 if (asset.type === 'image' || asset.type === 'video' || asset.type === 'audio') {
                   setMediaPreview({ assetId: asset.id, src: normalizeFileSrc(asset.path), type: asset.type as 'image' | 'video' | 'audio' });
                 }
               }}
               style={{ cursor: asset.type === 'image' || asset.type === 'video' || asset.type === 'audio' ? 'pointer' : 'default' }}
               onContextMenu={(e) => handleContextMenuForAsset(e, asset)}
             >
               {/* 删除按钮 - 右上角 */}
               <button
                 className="asset-delete-btn"
                 onClick={(e) => {
                   e.stopPropagation();
                   if (confirm(`确定要删除资产 "${asset.name}" 吗？`)) {
                     deleteAsset(asset.id);
                   }
                 }}
               >
                 <CloseIcon size={14} />
               </button>

               {asset.type === 'image' ? (
                 <img src={normalizeFileSrc(asset.path)} alt={asset.name} className="asset-thumbnail" />
               ) : asset.type === 'video' ? (
                 <div className="asset-thumbnail-wrap">
                   <video
                     className="asset-thumbnail asset-thumbnail-video"
                     src={normalizeFileSrc(asset.path) + '#t=0.1'}
                     preload="metadata"
                     muted
                     playsInline
                     onLoadedMetadata={(e) => {
                       const v = e.currentTarget as HTMLVideoElement;
                       try { if (v.currentTime === 0) v.currentTime = 0.1; } catch {}
                     }}
                   />
                   <div className="asset-video-badge"><VideoIcon size={16} /></div>
                 </div>
               ) : (
                 <div className="asset-icon-large">
                   {asset.type === 'audio' ? <MusicIcon size={48} /> : <FileIcon size={48} />}
                 </div>
               )}

               {/* 底部遮罩 - 文件名和重命名图标 */}
               <div className="asset-overlay">
                 <div className="asset-name-overlay" title={asset.name}>
                   {asset.name}
                 </div>
                 <button
                   className="asset-rename-btn"
                   onClick={(e) => {
                     e.stopPropagation();
                     setRenamingId(asset.id);
                     setRenameValue(asset.name);
                   }}
                 >
                   <EditIcon size={14} />
                 </button>
               </div>
             </div>
           ))}
         </div>
        
        {/* 分页控件 */}
        {currentAssets.length > ITEMS_PER_PAGE && (
          <div className="pagination">
            {/* 上一页按钮：第2页及以后才显示 */}
            {currentPage >= 2 && (
              <button
                className="pagination-btn prev"
                onClick={() => setCurrentPage(p => p - 1)}
              >
                ‹ 上一页
              </button>
            )}
            
            {/* 页码数字 */}
            <div className="pagination-numbers">
              {pageNumbers.map((num, idx) => (
                num === -1 ? (
                  <span key={`ellipsis-${idx}`} className="pagination-ellipsis">...</span>
                ) : (
                  <button
                    key={num}
                    className={`pagination-btn number ${num === currentPage ? 'active' : ''}`}
                    onClick={() => setCurrentPage(num)}
                  >
                    {num}
                  </button>
                )
              ))}
            </div>
            
            {/* 下一页按钮 */}
            {currentPage < totalPages && (
              <button
                className="pagination-btn next"
                onClick={() => setCurrentPage(p => p + 1)}
              >
                下一页 ›
              </button>
            )}
          </div>
        )}
        
        {/* 空状态：仅在进入子文件夹且该文件夹为空时显示 */}
        {currentAssets.length === 0 && selectedFolderId && selectedFolderId !== 'root' && (
          <div className="empty-state">
            <div className="empty-icon"><PackageIcon size={64} /></div>
            <div className="empty-text">暂无资产</div>
            <div className="empty-hint">上传文件或在对话中生成图片/视频</div>
          </div>
        )}
      </div>
      
      {/* 上传文件输入框 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />
      
      {/* 上传确认对话框 */}
      {showUploadDialog && (
        <div className="modal-overlay" onClick={() => setShowUploadDialog(false)}>
          <div className="modal-content upload-confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="upload-dialog-header">
              <div className="upload-dialog-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div>
                <h3>确认上传</h3>
                <p className="upload-dialog-subtitle">将上传 {uploadFiles.length} 个文件</p>
              </div>
            </div>
            
            <div className="upload-file-list">
              {uploadFiles.map((file, idx) => {
                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                const isImage = ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext);
                const size = (file.size / 1024).toFixed(1) + ' KB';
                return (
                  <div key={idx} className="upload-file-item">
                    <div className={`file-type-icon ${isImage ? 'image' : 'file'}`}>
                      {isImage ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                      )}
                    </div>
                    <div className="file-info">
                      <span className="file-name" title={file.name}>{file.name}</span>
                      <span className="file-size">{size}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="modal-actions upload-dialog-actions">
              <button className="modal-btn cancel" onClick={() => setShowUploadDialog(false)}>取消</button>
              <button className="modal-btn confirm upload-btn-primary" onClick={confirmUpload}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px', display: 'inline-block', verticalAlign: 'middle'}}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                确认上传
              </button>
            </div>
          </div>
        </div>
      )}


      
      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 存入提示词库弹窗 */}
      <SaveToPromptLibraryModal
        isOpen={saveToPromptModal.isOpen}
        onClose={() => setSaveToPromptModal(prev => ({ ...prev, isOpen: false }))}
        defaultPrompt={saveToPromptModal.prompt}
        defaultName={saveToPromptModal.name}
        thumbnail={saveToPromptModal.thumbnail}
        sourceType={saveToPromptModal.sourceType}
      />

      {/* 媒体预览弹窗 */}
      {mediaPreview && (() => {
        const previewAsset = assets[mediaPreview.assetId];
        return (
          <div className="modal-overlay" onClick={() => setMediaPreview(null)}>
            <div
              className="modal-content media-preview-dialog asset-preview-dialog"
              onClick={e => e.stopPropagation()}
              onContextMenu={e => {
                if (previewAsset) {
                  handlePreviewContextMenu(e, previewAsset);
                } else {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              title="右键打开操作菜单"
            >
              <button
                className="asset-preview-close"
                onClick={() => setMediaPreview(null)}
                title="关闭"
                aria-label="关闭预览"
              >
                <CloseIcon size={16} />
              </button>

              <div className="asset-preview-title">
                <span>预览</span>
                {previewAsset && <strong title={previewAsset.name}>{previewAsset.name}</strong>}
              </div>

              <div className="media-preview-body asset-preview-body">
                {mediaPreview.type === 'image' && (
                  <img src={normalizeFileSrc(mediaPreview.src)} alt={previewAsset?.name || 'preview'} />
                )}
                {mediaPreview.type === 'video' && (
                  <video src={normalizeFileSrc(mediaPreview.src)} controls autoPlay />
                )}
                {mediaPreview.type === 'audio' && (
                  <audio src={normalizeFileSrc(mediaPreview.src)} controls autoPlay />
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 内联重命名输入框 */}
      {renamingId && (
        <div
          className="rename-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 99998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeInUp 0.15s ease-out',
          }}
        >
          <div
            className="rename-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary, #2a2a2a)',
              border: '1px solid var(--border-color, rgba(255,255,255,0.12))',
              borderRadius: 16,
              padding: 24,
              minWidth: 280,
              maxWidth: 320,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div style={{ fontSize: 14, color: 'var(--text-secondary, #888)', fontWeight: 500 }}>重命名</div>
            <input
              className="rename-input"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              autoFocus
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'var(--bg-primary, #1a1a1a)',
                border: '1px solid var(--accent-color, #4a9eff)',
                borderRadius: 10,
                color: 'var(--text-primary, #e0e0e0)',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
                textAlign: 'center',
              }}
            />
            <div style={{ display: 'flex', gap: 10, width: '100%', justifyContent: 'center' }}>
              <button
                onClick={cancelRename}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color, rgba(255,255,255,0.12))',
                  background: 'transparent',
                  color: 'var(--text-secondary, #888)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >取消</button>
              <button
                onClick={confirmRename}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--accent-color, #4a9eff)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >确认</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 工具函数
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
