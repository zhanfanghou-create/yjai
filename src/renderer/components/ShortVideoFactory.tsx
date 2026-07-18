/**
 * Short Video Factory - React 版本
 * 一键生成产品营销与泛内容短视频
 * 基于 https://github.com/wanna1114/short-video-factory 移植
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import './ShortVideoFactory.css';
import { checkDependencies, installEdgeTts } from './shortVideoFactoryUtils';
import { useAppStore } from '../store/appStore';

// ==================== SVG 图标组件 ====================
type SvfIconName = 'settings' | 'spark' | 'folder' | 'video' | 'refresh' | 'speaker' | 'rocket' | 'stop' | 'check' | 'x' | 'pen' | 'film' | 'loading';
const SvfIcon = ({ name, size = 16 }: { name: SvfIconName; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    {name === 'settings' ? <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></> :
    name === 'spark' ? <><path d="M12 3v18M5.5 9.5l13 5M5.5 14.5l13-5" /><path d="M12 3l4 6-4 6-4-6z" /></> :
    name === 'folder' ? <><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></> :
    name === 'video' ? <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="M17 9l4-3v12l-4-3" /></> :
    name === 'refresh' ? <><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></> :
    name === 'speaker' ? <><rect x="3" y="5" width="2" height="14" rx="1" /><path d="M7 9h4l5 3V6L11 9H7z" /></> :
    name === 'rocket' ? <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2l.5-.5" /><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></> :
    name === 'stop' ? <><rect x="3" y="3" width="18" height="18" rx="2" /></> :
    name === 'check' ? <><polyline points="20 6 9 17 4 12" /></> :
    name === 'x' ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></> :
    name === 'pen' ? <><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></> :
    name === 'film' ? <><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" /></> :
    name === 'loading' ? <><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" /></> :
    null}
  </svg>
);

// ==================== 类型定义 ====================

export enum RenderStatus {
  None = 'none',
  GenerateText = 'generateText',
  SynthesizedSpeech = 'synthesizedSpeech',
  SegmentVideo = 'segmentVideo',
  Rendering = 'rendering',
  Completed = 'completed',
  Failed = 'failed',
}

interface EdgeTTSVoice {
  Name: string;
  ShortName: string;
  FriendlyName: string;
  Gender: 'Male' | 'Female';
  Locale: string;
}

interface LLMConfig {
  modelName: string;
  apiUrl: string;
  apiKey: string;
}

interface RenderConfig {
  bgmPath: string;
  outputSize: { width: number; height: number };
  outputPath: string;
  outputFileName: string;
  outputFileExt: string;
}

interface VideoAsset {
  path: string;
  name: string;
  size: number;
  duration?: number;
}

interface VideoSegment {
  videoFiles: string[];
  timeRanges: [string, string][];
}

// ==================== 主组件 ====================

export const ShortVideoFactory: React.FC = () => {
  // 依赖状态
  const [deps, setDeps] = useState<{
    edgeTts: { ok: boolean; error?: string; installHint?: string };
    ffmpeg: { ok: boolean; error?: string; version?: string };
  } | null>(null);
  const [checkingDeps, setCheckingDeps] = useState(true);
  const [installingEdgeTts, setInstallingEdgeTts] = useState(false);
  
  // 全局状态
  const [renderStatus, setRenderStatus] = useState<RenderStatus>(RenderStatus.None);
  const [autoBatch, setAutoBatch] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  
  // LLM 配置
  const [prompt, setPrompt] = useState('');
  const [llmConfig, setLLMConfig] = useState<LLMConfig>({
    modelName: 'gpt-3.5-turbo',
    apiUrl: 'https://api.openai.com/v1',
    apiKey: '',
  });
  // 从全局设置的对话接口自动带入配置，避免在此页重复填写（用户仍可手动覆盖）
  const svfChatConfigs = useAppStore(st => st.chatAPIConfigs);
  const svfApiConfigs = useAppStore(st => st.apiConfigs);
  const svfSeededRef = useRef(false);
  useEffect(() => {
    if (svfSeededRef.current) return;
    const candidate = [...(svfChatConfigs || []), ...(svfApiConfigs || [])]
      .find((c: any) => c && c.baseUrl && c.apiKey);
    if (candidate) {
      svfSeededRef.current = true;
      setLLMConfig(prev => (prev.apiKey ? prev : {
        modelName: candidate.defaultModel || candidate.models?.[0] || prev.modelName,
        apiUrl: candidate.baseUrl,
        apiKey: candidate.apiKey,
      }));
    }
  }, [svfChatConfigs, svfApiConfigs]);
  
  // 文案生成
  const [outputText, setOutputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // TTS 配置
  const [voices, setVoices] = useState<EdgeTTSVoice[]>([]);
  const [language, setLanguage] = useState<string>('');
  const [gender, setGender] = useState<'Male' | 'Female'>('Female');
  const [voice, setVoice] = useState<EdgeTTSVoice | null>(null);
  const [speed, setSpeed] = useState(0);
  const [tryListeningText, setTryListeningText] = useState('你好，欢迎使用短视频工厂！');
  
  // 视频素材
  const [videoAssetsFolder, setVideoAssetsFolder] = useState('');
  const [videoAssets, setVideoAssets] = useState<VideoAsset[]>([]);
  const [videoInfoList, setVideoInfoList] = useState<{ duration: number; width: number; height: number }[]>([]);
  
  // 渲染配置
  const [renderConfig, setRenderConfig] = useState<RenderConfig>({
    bgmPath: '',
    outputSize: { width: 1080, height: 1920 },
    outputPath: '',
    outputFileName: '',
    outputFileExt: '.mp4',
  });
  
  // 弹窗控制
  const [showLLMConfig, setShowLLMConfig] = useState(false);
  const [showRenderConfig, setShowRenderConfig] = useState(false);
  
  // 计算属性
  const languageList = useMemo(() => {
    const list = Array.isArray(voices) ? voices : [];
    const langs = list
      .map(v => v?.FriendlyName?.split(' - ').pop()?.split(' (').shift())
      .filter(Boolean) as string[];
    return [...new Set(langs)];
  }, [voices]);
  
  const filteredVoices = useMemo(() => {
    if (!language || !gender) return [];
    const list = Array.isArray(voices) ? voices : [];
    return list.filter(v => v?.FriendlyName?.includes(language) && v?.Gender === gender);
  }, [voices, language, gender]);
  
  const taskInProgress = useMemo(() => {
    return renderStatus !== RenderStatus.None && 
           renderStatus !== RenderStatus.Completed && 
           renderStatus !== RenderStatus.Failed;
  }, [renderStatus]);
  
  // ==================== 初始化 ====================
  
  useEffect(() => {
    checkAndLoadDeps();
  }, []);
  
  const checkAndLoadDeps = async () => {
    setCheckingDeps(true);
    try {
      const depsStatus = await checkDependencies();
      setDeps(depsStatus);
      
      if (depsStatus.edgeTts.ok) {
        await fetchVoices();
      }
    } catch (error) {
      console.error('依赖检查失败:', error);
    } finally {
      setCheckingDeps(false);
    }
  };
  
  const fetchVoices = async () => {
    try {
      const win = window as any;
      if (win?.yijingAPI?.edgeTts?.getVoiceList) {
        const res: any = await win.yijingAPI.edgeTts.getVoiceList();
        const list: any[] = Array.isArray(res) ? res : Array.isArray(res?.voices) ? res.voices : Array.isArray(res?.data) ? res.data : [];
        setVoices(list as any);
      }
    } catch (error) {
      console.error('获取语音列表失败:', error);
    }
  };
  
  // ==================== AI 文案生成 ====================
  
  const handleGenerateText = async (options?: { noToast?: boolean }) => {
    if (!prompt.trim()) {
      if (!options?.noToast) alert('请输入提示词');
      throw new Error('请输入提示词');
    }
    
    setIsGenerating(true);
    setOutputText('');
    abortControllerRef.current = new AbortController();
    
    try {
      const response = await fetch(`${llmConfig.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llmConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: llmConfig.modelName,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
        signal: abortControllerRef.current.signal,
      });
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              fullText += content;
              setOutputText(fullText);
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
      
      return fullText;
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('生成失败:', error);
        if (!options?.noToast) alert(`生成失败: ${error.message}`);
        throw error;
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };
  
  const handleStopGenerate = () => {
    abortControllerRef.current?.abort();
  };
  
  // ==================== TTS 试听 ====================
  
  const handleTryListening = async () => {
    if (!voice) {
      alert('请选择语音');
      return;
    }
    if (!tryListeningText.trim()) {
      alert('请输入试听文本');
      return;
    }
    
    try {
      const win = window as any;
      if (win?.yijingAPI?.edgeTts?.synthesizeToBase64) {
        const res: any = await win.yijingAPI.edgeTts.synthesizeToBase64({
          text: tryListeningText,
          voice: voice.ShortName,
          options: { rate: speed },
        });
        const base64: string | undefined = typeof res === 'string'
          ? res
          : (res?.base64 || res?.data || undefined);
        if (!base64) {
          const msg = (res && typeof res === 'object' && 'error' in res) ? String((res as any).error || '') : '';
          throw new Error(msg || 'TTS 无输出');
        }
        const audio = new Audio(`data:audio/mp3;base64,${base64}`);
        try {
          await audio.play();
        } catch (playErr) {
          console.warn('自动播放被拦截，需用户手动触发:', playErr);
        }
      } else {
        throw new Error('TTS 服务不可用');
      }
    } catch (error) {
      console.error('试听失败:', error);
      alert('试听失败: ' + ((error as Error)?.message || String(error)));
    }
  };
  
  const synthesizedSpeechToFile = async (text: string, withCaption?: boolean) => {
    if (!voice) throw new Error('请选择语音');
    
    const win = window as any;
    if (win?.yijingAPI?.edgeTts?.synthesizeToFile) {
      return await win.yijingAPI.edgeTts.synthesizeToFile({
        text,
        voice: voice.ShortName,
        options: { rate: speed },
        withCaption,
      });
    }
    throw new Error('TTS 服务不可用');
  };
  
  // ==================== 视频素材管理 ====================
  
  const handleSelectAssetsFolder = async () => {
    const win = window as any;
    if (win?.yijingAPI?.fileSystem?.selectFolder) {
      const folder = await win.yijingAPI.fileSystem.selectFolder({
        title: '选择视频素材文件夹',
      });
      if (folder) {
        setVideoAssetsFolder(folder);
        refreshAssets(folder);
      }
    }
  };
  
  const refreshAssets = async (folder: string) => {
    try {
      const win = window as any;
      if (win?.yijingAPI?.fileSystem?.listFilesFromFolder) {
        const raw: any = await win.yijingAPI.fileSystem.listFilesFromFolder({
          folderPath: folder,
        });
        const files: any[] = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.files)
          ? raw.files
          : Array.isArray(raw?.data)
          ? raw.data
          : [];
        const mp4Files = files.filter(f => typeof f?.name === 'string' && f.name.toLowerCase().endsWith('.mp4'));
        setVideoAssets(mp4Files);
      }
    } catch (error) {
      console.error('刷新素材失败:', error);
    }
  };
  
  const getVideoSegments = (duration: number): VideoSegment => {
    const totalDuration = videoInfoList.reduce((sum, info) => sum + (info?.duration || 0), 0);
    if (totalDuration < duration) {
      throw new Error('素材总时长不足');
    }
    
    const segments: VideoSegment = { videoFiles: [], timeRanges: [] };
    const minSegmentDuration = 2;
    const maxSegmentDuration = 15;
    
    let currentDuration = 0;
    let tempAssets = [...videoAssets];
    
    const trunc3 = (n: number) => Math.floor(n * 1000) / 1000;
    
    while (currentDuration < duration) {
      if (tempAssets.length === 0) {
        tempAssets = [...videoAssets];
        continue;
      }
      
      const randomIndex = Math.floor(Math.random() * tempAssets.length);
      const asset = tempAssets[randomIndex];
      const assetInfo = videoInfoList[videoAssets.findIndex(a => a.path === asset.path)];
      
      tempAssets.splice(randomIndex, 1);
      
      if (!assetInfo || assetInfo.duration < minSegmentDuration) {
        if (assetInfo) {
          segments.videoFiles.push(asset.path);
          segments.timeRanges.push(['0', String(assetInfo.duration)]);
          currentDuration = trunc3(currentDuration + assetInfo.duration);
        }
        continue;
      }
      
      let segmentDuration = Math.min(
        maxSegmentDuration,
        assetInfo.duration,
        duration - currentDuration
      );
      
      if (segmentDuration < minSegmentDuration) {
        segmentDuration = Math.min(duration - currentDuration, assetInfo.duration);
      }
      
      const startTime = Math.random() * (assetInfo.duration - segmentDuration);
      
      segments.videoFiles.push(asset.path);
      segments.timeRanges.push([
        String(trunc3(startTime)),
        String(trunc3(startTime + segmentDuration)),
      ]);
      currentDuration = trunc3(currentDuration + segmentDuration);
    }
    
    return segments;
  };
  
  // ==================== 视频渲染 ====================
  
  const handleRenderVideo = async () => {
    if (!renderConfig.outputFileName) {
      alert('请输入输出文件名');
      return;
    }
    if (!renderConfig.outputPath) {
      alert('请选择输出文件夹');
      return;
    }
    if (videoAssets.length === 0) {
      alert('请选择视频素材文件夹');
      return;
    }
    
    try {
      // 1. 生成文案
      setRenderStatus(RenderStatus.GenerateText);
      const text = outputText || await handleGenerateText({ noToast: true });
      
      // 2. 语音合成
      setRenderStatus(RenderStatus.SynthesizedSpeech);
      const ttsResult = await synthesizedSpeechToFile(text, true);
      
      if (!ttsResult?.duration) {
        throw new Error('语音合成失败');
      }
      
      // 3. 获取视频分镜
      setRenderStatus(RenderStatus.SegmentVideo);
      const segments = getVideoSegments(ttsResult.duration);
      
      // 随机选择 BGM
      let randomBgm: string | undefined;
      if (renderConfig.bgmPath) {
        const win = window as any;
        if (win?.yijingAPI?.fileSystem?.listFilesFromFolder) {
          const bgmFiles = await win.yijingAPI.fileSystem.listFilesFromFolder({
            folderPath: renderConfig.bgmPath,
          });
          if (bgmFiles.length > 0) {
            randomBgm = bgmFiles[Math.floor(Math.random() * bgmFiles.length)].path;
          }
        }
      }
      
      // 4. 合成视频
      setRenderStatus(RenderStatus.Rendering);
      const win = window as any;
      if (win?.yijingAPI?.video?.render) {
        await win.yijingAPI.video.render({
          ...segments,
          audioFiles: { bgm: randomBgm },
          outputSize: renderConfig.outputSize,
          outputDuration: String(ttsResult.duration),
          outputPath: `${renderConfig.outputPath}/${renderConfig.outputFileName}${renderConfig.outputFileExt}`,
        }, (progress: number) => {
          setRenderProgress(progress);
        });
      }
      
      setRenderStatus(RenderStatus.Completed);
      
      // 自动批量
      if (autoBatch) {
        setOutputText('');
        setTimeout(() => handleRenderVideo(), 1000);
      }
    } catch (error: any) {
      console.error('渲染失败:', error);
      setRenderStatus(RenderStatus.Failed);
      alert(`渲染失败: ${error.message}`);
    }
  };
  
  const handleCancelRender = () => {
    const win = window as any;
    if (renderStatus === RenderStatus.Rendering) {
      win?.ipcRenderer?.send?.('cancel-render-video');
    }
    if (isGenerating) {
      handleStopGenerate();
    }
    setRenderStatus(RenderStatus.None);
  };
  
  const handleSelectOutputFolder = async () => {
    const win = window as any;
    if (win?.yijingAPI?.fileSystem?.selectFolder) {
      const folder = await win.yijingAPI.fileSystem.selectFolder({
        title: '选择输出文件夹',
        defaultPath: renderConfig.outputPath,
      });
      if (folder) {
        setRenderConfig(prev => ({ ...prev, outputPath: folder }));
      }
    }
  };
  
  const handleSelectBgmFolder = async () => {
    const win = window as any;
    if (win?.yijingAPI?.fileSystem?.selectFolder) {
      const folder = await win.yijingAPI.fileSystem.selectFolder({
        title: '选择背景音乐文件夹',
        defaultPath: renderConfig.bgmPath,
      });
      if (folder) {
        setRenderConfig(prev => ({ ...prev, bgmPath: folder }));
      }
    }
  };
  
  // ==================== 渲染 ====================
  
  return (
    <div className="svf-container">
      {/* 标题栏 */}
      <div className="svf-header">
        <h1><SvfIcon name="film" size={20} /> 短视频工厂</h1>
        <span className="svf-subtitle">一键生成产品营销与泛内容短视频</span>
      </div>
      
      {/* 三栏布局 */}
      <div className="svf-main">
        {/* 左栏：AI 文案生成 */}
        <div className="svf-panel">
          <div className="svf-panel-header">
            <h3><SvfIcon name="pen" size={15} /> AI 文案生成</h3>
            <button
              className="svf-btn-icon"
              onClick={() => setShowLLMConfig(true)}
              disabled={taskInProgress}
            >
              <SvfIcon name="settings" size={15} />
            </button>
          </div>
          
          <div className="svf-panel-content">
            <div className="svf-input-group svf-input-group-stack">
              <textarea
                className="svf-textarea"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="输入产品卖点或视频主题，AI 将自动生成文案..."
                disabled={taskInProgress}
                rows={4}
              />
              <button
                className={`svf-btn ${isGenerating ? 'svf-btn-danger' : 'svf-btn-primary'}`}
                onClick={isGenerating ? handleStopGenerate : () => handleGenerateText()}
                disabled={taskInProgress && !isGenerating}
              >
                {isGenerating ? <><SvfIcon name="stop" size={14} /> 停止</> : <><SvfIcon name="spark" size={14} /> 生成</>}
              </button>
            </div>
            
            <textarea
              className="svf-textarea svf-output"
              value={outputText}
              onChange={(e) => setOutputText(e.target.value)}
              placeholder="生成的文案将显示在这里..."
              disabled={taskInProgress}
              rows={8}
            />
          </div>
        </div>
        
        {/* 中栏：视频素材管理 */}
        <div className="svf-panel">
          <div className="svf-panel-header">
            <h3><SvfIcon name="video" size={15} /> 视频素材</h3>
          </div>
          
          <div className="svf-panel-content">
            <div className="svf-input-group">
              <input
                type="text"
                className="svf-input"
                value={videoAssetsFolder}
                placeholder="选择素材文件夹..."
                readOnly
              />
              <button
                className="svf-btn svf-btn-secondary"
                onClick={handleSelectAssetsFolder}
                disabled={taskInProgress}
              >
                <SvfIcon name="folder" size={14} /> 选择
              </button>
            </div>
            
            <div className="svf-assets-grid">
              {videoAssets.length > 0 ? (
                videoAssets.map((asset, index) => (
                  <div key={index} className="svf-asset-item">
                    <video
                      src={`file://${asset.path}`}
                      className="svf-asset-preview"
                      muted
                      onLoadedMetadata={(e) => {
                        const video = e.target as HTMLVideoElement;
                        const newInfoList = [...videoInfoList];
                        newInfoList[index] = {
                          duration: video.duration,
                          width: video.videoWidth,
                          height: video.videoHeight,
                        };
                        setVideoInfoList(newInfoList);
                      }}
                    />
                    <span className="svf-asset-name">{asset.name}</span>
                  </div>
                ))
              ) : (
                <div className="svf-empty">
                  <p>暂无素材</p>
                  <p className="svf-empty-hint">请选择包含 MP4 视频的文件夹</p>
                </div>
              )}
            </div>
            
            <button
              className="svf-btn svf-btn-secondary svf-btn-block"
              onClick={() => refreshAssets(videoAssetsFolder)}
              disabled={!videoAssetsFolder || taskInProgress}
            >
              <SvfIcon name="refresh" size={14} /> 刷新素材
            </button>
          </div>
        </div>
        
        {/* 右栏：TTS + 渲染 */}
        <div className="svf-panel svf-panel-right">
          {/* TTS 控制 */}
          <div className="svf-panel-header">
            <h3><SvfIcon name="speaker" size={15} /> 语音合成</h3>
          </div>
          
          <div className="svf-panel-content svf-tts-section">
            <select
              className="svf-select"
              value={language}
              onChange={(e) => { setLanguage(e.target.value); setVoice(null); }}
              disabled={taskInProgress}
            >
              <option value="">选择语言</option>
              {languageList.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
            
            <select
              className="svf-select"
              value={gender}
              onChange={(e) => { setGender(e.target.value as 'Male' | 'Female'); setVoice(null); }}
              disabled={taskInProgress}
            >
              <option value="Female">女声</option>
              <option value="Male">男声</option>
            </select>
            
            <select
              className="svf-select"
              value={voice?.ShortName || ''}
              onChange={(e) => {
                const selected = voices.find(v => v.ShortName === e.target.value);
                setVoice(selected || null);
              }}
              disabled={taskInProgress || !language}
            >
              <option value="">选择语音</option>
              {filteredVoices.map(v => (
                <option key={v.ShortName} value={v.ShortName}>{v.FriendlyName}</option>
              ))}
            </select>
            
            <select
              className="svf-select"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              disabled={taskInProgress}
            >
              <option value={-30}>慢速</option>
              <option value={0}>正常</option>
              <option value={30}>快速</option>
            </select>
            
            <input
              type="text"
              className="svf-input"
              value={tryListeningText}
              onChange={(e) => setTryListeningText(e.target.value)}
              placeholder="试听文本"
              disabled={taskInProgress}
            />
            
            <button
              className="svf-btn svf-btn-secondary svf-btn-block"
              onClick={handleTryListening}
              disabled={!voice || taskInProgress}
            >
              <SvfIcon name="speaker" size={14} /> 试听
            </button>
          </div>
          
          {/* 渲染控制 */}
          <div className="svf-panel-header">
            <h3><SvfIcon name="rocket" size={15} /> 视频合成</h3>
            <button
              className="svf-btn-icon"
              onClick={() => setShowRenderConfig(true)}
              disabled={taskInProgress}
            >
              <SvfIcon name="settings" size={15} />
            </button>
          </div>
          
          <div className="svf-panel-content svf-render-section">
            {/* 状态显示 */}
            <div className="svf-status">
              {renderStatus === RenderStatus.None && <span className="svf-status-idle">就绪</span>}
              {renderStatus === RenderStatus.GenerateText && <span className="svf-status-active"><SvfIcon name="pen" size={13} /> 生成文案...</span>}
              {renderStatus === RenderStatus.SynthesizedSpeech && <span className="svf-status-active"><SvfIcon name="speaker" size={13} /> 合成语音...</span>}
              {renderStatus === RenderStatus.SegmentVideo && <span className="svf-status-active"><SvfIcon name="video" size={13} /> 分镜处理...</span>}
              {renderStatus === RenderStatus.Rendering && <span className="svf-status-active"><SvfIcon name="film" size={13} /> 渲染中...</span>}
              {renderStatus === RenderStatus.Completed && <span className="svf-status-success"><SvfIcon name="check" size={13} /> 完成</span>}
              {renderStatus === RenderStatus.Failed && <span className="svf-status-error"><SvfIcon name="x" size={13} /> 失败</span>}
            </div>
            
            {/* 进度条 */}
            {taskInProgress && (
              <div className="svf-progress">
                <div 
                  className="svf-progress-bar" 
                  style={{ width: `${renderProgress}%` }}
                />
                <span className="svf-progress-text">{renderProgress.toFixed(0)}%</span>
              </div>
            )}
            
            {/* 渲染按钮 */}
            {!taskInProgress ? (
              <button
                className="svf-btn svf-btn-primary svf-btn-large svf-btn-block"
                onClick={handleRenderVideo}
                disabled={!videoAssets.length || !voice}
              >
                <SvfIcon name="rocket" size={15} /> 开始合成
              </button>
            ) : (
              <button
                className="svf-btn svf-btn-danger svf-btn-large svf-btn-block"
                onClick={handleCancelRender}
              >
                <SvfIcon name="stop" size={15} /> 停止合成
              </button>
            )}
            
            {/* 自动批量 */}
            <label className="svf-checkbox">
              <input
                type="checkbox"
                checked={autoBatch}
                onChange={(e) => setAutoBatch(e.target.checked)}
                disabled={taskInProgress}
              />
              <span>自动批量生成（循环模式）</span>
            </label>
          </div>
        </div>
      </div>
      
      {/* LLM 配置弹窗 */}
      {showLLMConfig && (
        <div className="svf-modal-overlay" onClick={() => setShowLLMConfig(false)}>
          <div className="svf-modal" onClick={(e) => e.stopPropagation()}>
            <h3><SvfIcon name="settings" size={16} /> LLM 配置</h3>
            <input
              type="text"
              className="svf-input"
              value={llmConfig.modelName}
              onChange={(e) => setLLMConfig(prev => ({ ...prev, modelName: e.target.value }))}
              placeholder="模型名称 (如: gpt-3.5-turbo)"
            />
            <input
              type="text"
              className="svf-input"
              value={llmConfig.apiUrl}
              onChange={(e) => setLLMConfig(prev => ({ ...prev, apiUrl: e.target.value }))}
              placeholder="API 地址"
            />
            <input
              type="password"
              className="svf-input"
              value={llmConfig.apiKey}
              onChange={(e) => setLLMConfig(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder="API Key"
            />
            <div className="svf-modal-actions">
              <button className="svf-btn" onClick={() => setShowLLMConfig(false)}>关闭</button>
              <button className="svf-btn svf-btn-primary">测试连接</button>
              <button className="svf-btn svf-btn-primary" onClick={() => setShowLLMConfig(false)}>保存</button>
            </div>
          </div>
        </div>
      )}
      
      {/* 渲染配置弹窗 */}
      {showRenderConfig && (
        <div className="svf-modal-overlay" onClick={() => setShowRenderConfig(false)}>
          <div className="svf-modal" onClick={(e) => e.stopPropagation()}>
            <h3><SvfIcon name="settings" size={16} /> 渲染配置</h3>
            
            <div className="svf-input-row">
              <input
                type="number"
                className="svf-input"
                value={renderConfig.outputSize.width}
                onChange={(e) => setRenderConfig(prev => ({ 
                  ...prev, 
                  outputSize: { ...prev.outputSize, width: Number(e.target.value) }
                }))}
                placeholder="宽度"
              />
              <span>×</span>
              <input
                type="number"
                className="svf-input"
                value={renderConfig.outputSize.height}
                onChange={(e) => setRenderConfig(prev => ({ 
                  ...prev, 
                  outputSize: { ...prev.outputSize, height: Number(e.target.value) }
                }))}
                placeholder="高度"
              />
            </div>
            
            <div className="svf-input-group">
              <input
                type="text"
                className="svf-input"
                value={renderConfig.outputFileName}
                onChange={(e) => setRenderConfig(prev => ({ ...prev, outputFileName: e.target.value }))}
                placeholder="输出文件名"
              />
              <span className="svf-input-suffix">.mp4</span>
            </div>
            
            <div className="svf-input-group">
              <input
                type="text"
                className="svf-input"
                value={renderConfig.outputPath}
                placeholder="输出文件夹"
                readOnly
              />
              <button className="svf-btn svf-btn-secondary" onClick={handleSelectOutputFolder}>
                <SvfIcon name="folder" size={14} />
              </button>
            </div>
            
            <div className="svf-input-group">
              <input
                type="text"
                className="svf-input"
                value={renderConfig.bgmPath}
                placeholder="背景音乐文件夹（可选）"
                readOnly
              />
              <button className="svf-btn svf-btn-secondary" onClick={handleSelectBgmFolder}>
                <SvfIcon name="folder" size={14} />
              </button>
            </div>
            
            <div className="svf-modal-actions">
              <button className="svf-btn" onClick={() => setShowRenderConfig(false)}>关闭</button>
              <button className="svf-btn svf-btn-primary" onClick={() => setShowRenderConfig(false)}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShortVideoFactory;
