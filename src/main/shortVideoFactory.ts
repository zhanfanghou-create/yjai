/**
 * Short Video Factory - 主进程支持
 * Edge TTS 语音合成 + FFmpeg 视频渲染
 */

import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { webcrypto as nodeWebCrypto } from 'crypto';

// msedge-tts 依赖全局 WebCrypto（crypto.subtle / crypto.getRandomValues），
// Electron 28 的 Node 18 默认没暴露 globalThis.crypto，这里做一次兼容补丁。
if (typeof (globalThis as any).crypto === 'undefined' || !(globalThis as any).crypto?.subtle) {
  (globalThis as any).crypto = nodeWebCrypto as any;
}

const execAsync = promisify(require('child_process').exec);

// ==================== Edge TTS ====================

interface EdgeTTSVoice {
  Name: string;
  ShortName: string;
  FriendlyName: string;
  Gender: 'Male' | 'Female';
  Locale: string;
  SuggestedCodec: string;
}

// 获取 Edge TTS 语音列表
async function getEdgeTTSVoiceList(): Promise<EdgeTTSVoice[]> {
  // 预定义的常用语音列表（Edge TTS 的语音是固定的）
  return [
    // 中文
    { Name: 'zh-CN-XiaoxiaoNeural', ShortName: 'zh-CN-XiaoxiaoNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoxiaoNeural)', Gender: 'Female', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-YunxiNeural', ShortName: 'zh-CN-YunxiNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, YunxiNeural)', Gender: 'Male', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-YunjianNeural', ShortName: 'zh-CN-YunjianNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, YunjianNeural)', Gender: 'Male', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-XiaoyiNeural', ShortName: 'zh-CN-XiaoyiNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoyiNeural)', Gender: 'Female', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-YunyangNeural', ShortName: 'zh-CN-YunyangNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, YunyangNeural)', Gender: 'Male', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-XiaochenNeural', ShortName: 'zh-CN-XiaochenNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaochenNeural)', Gender: 'Female', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-XiaohanNeural', ShortName: 'zh-CN-XiaohanNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaohanNeural)', Gender: 'Female', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-XiaomengNeural', ShortName: 'zh-CN-XiaomengNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaomengNeural)', Gender: 'Female', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-XiaomoNeural', ShortName: 'zh-CN-XiaomoNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaomoNeural)', Gender: 'Female', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-XiaoqiuNeural', ShortName: 'zh-CN-XiaoqiuNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoqiuNeural)', Gender: 'Female', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-XiaoruiNeural', ShortName: 'zh-CN-XiaoruiNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoruiNeural)', Gender: 'Female', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-XiaoshuangNeural', ShortName: 'zh-CN-XiaoshuangNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoshuangNeural)', Gender: 'Female', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-XiaoxuanNeural', ShortName: 'zh-CN-XiaoxuanNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoxuanNeural)', Gender: 'Female', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-XiaoyanNeural', ShortName: 'zh-CN-XiaoyanNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoyanNeural)', Gender: 'Female', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-XiaoyouNeural', ShortName: 'zh-CN-XiaoyouNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaoyouNeural)', Gender: 'Female', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-XiaozhenNeural', ShortName: 'zh-CN-XiaozhenNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, XiaozhenNeural)', Gender: 'Female', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-YunfengNeural', ShortName: 'zh-CN-YunfengNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, YunfengNeural)', Gender: 'Male', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-YunhaoNeural', ShortName: 'zh-CN-YunhaoNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, YunhaoNeural)', Gender: 'Male', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-YunxiaNeural', ShortName: 'zh-CN-YunxiaNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, YunxiaNeural)', Gender: 'Male', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-YunyeNeural', ShortName: 'zh-CN-YunyeNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, YunyeNeural)', Gender: 'Male', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-CN-YunzeNeural', ShortName: 'zh-CN-YunzeNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-CN, YunzeNeural)', Gender: 'Male', Locale: 'zh-CN', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    // 粤语
    { Name: 'zh-HK-HiuMaanNeural', ShortName: 'zh-HK-HiuMaanNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-HK, HiuMaanNeural)', Gender: 'Female', Locale: 'zh-HK', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-HK-WanLungNeural', ShortName: 'zh-HK-WanLungNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-HK, WanLungNeural)', Gender: 'Male', Locale: 'zh-HK', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    // 台湾
    { Name: 'zh-TW-HsiaoChenNeural', ShortName: 'zh-TW-HsiaoChenNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-TW, HsiaoChenNeural)', Gender: 'Female', Locale: 'zh-TW', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'zh-TW-YunJheNeural', ShortName: 'zh-TW-YunJheNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (zh-TW, YunJheNeural)', Gender: 'Male', Locale: 'zh-TW', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    // 英语
    { Name: 'en-US-AriaNeural', ShortName: 'en-US-AriaNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (en-US, AriaNeural)', Gender: 'Female', Locale: 'en-US', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'en-US-GuyNeural', ShortName: 'en-US-GuyNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (en-US, GuyNeural)', Gender: 'Male', Locale: 'en-US', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'en-US-JennyNeural', ShortName: 'en-US-JennyNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (en-US, JennyNeural)', Gender: 'Female', Locale: 'en-US', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'en-GB-SoniaNeural', ShortName: 'en-GB-SoniaNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (en-GB, SoniaNeural)', Gender: 'Female', Locale: 'en-GB', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'en-GB-RyanNeural', ShortName: 'en-GB-RyanNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (en-GB, RyanNeural)', Gender: 'Male', Locale: 'en-GB', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    // 日语
    { Name: 'ja-JP-NanamiNeural', ShortName: 'ja-JP-NanamiNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (ja-JP, NanamiNeural)', Gender: 'Female', Locale: 'ja-JP', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'ja-JP-KeitaNeural', ShortName: 'ja-JP-KeitaNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (ja-JP, KeitaNeural)', Gender: 'Male', Locale: 'ja-JP', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    // 韩语
    { Name: 'ko-KR-SunHiNeural', ShortName: 'ko-KR-SunHiNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (ko-KR, SunHiNeural)', Gender: 'Female', Locale: 'ko-KR', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
    { Name: 'ko-KR-InJoonNeural', ShortName: 'ko-KR-InJoonNeural', FriendlyName: 'Microsoft Server Speech Text to Speech Voice (ko-KR, InJoonNeural)', Gender: 'Male', Locale: 'ko-KR', SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3' },
  ];
}

// 使用 edge-tts 命令行工具合成语音
// 使用 Microsoft Edge 在线免费 TTS（wss://speech.platform.bing.com），无需本机 CLI，不会闪退
async function synthesizeEdgeTTS(
  text: string,
  voice: string,
  options?: { rate?: number; volume?: number; pitch?: number }
): Promise<{ audioPath: string; subtitlePath?: string; duration?: number }> {
  const cleanedText = String(text ?? '').trim();
  if (!cleanedText) throw new Error('待合成文本为空');
  const cleanedVoice = String(voice || 'zh-CN-XiaoxiaoNeural');

  const tempDir = path.join(app.getPath('temp'), 'yijing-ai', 'tts');
  try { fs.mkdirSync(tempDir, { recursive: true }); } catch {}

  const fileName = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const audioPath = path.join(tempDir, `${fileName}.mp3`);
  const subtitlePath = path.join(tempDir, `${fileName}.srt`);

  const mod: any = await import('msedge-tts').catch(err => {
    throw new Error('加载 msedge-tts 失败：' + (err?.message || String(err)));
  });
  const OUTPUT_FORMAT: any = mod.OUTPUT_FORMAT || {};
  const format = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3 || 'audio-24khz-48kbitrate-mono-mp3';

  const prosody: any = {};
  if (typeof options?.rate === 'number' && options.rate !== 0) {
    prosody.rate = `${options.rate > 0 ? '+' : ''}${options.rate}%`;
  }
  if (typeof options?.volume === 'number' && options.volume !== 0) {
    prosody.volume = `${options.volume > 0 ? '+' : ''}${options.volume}%`;
  }
  if (typeof options?.pitch === 'number' && options.pitch !== 0) {
    prosody.pitch = `${options.pitch > 0 ? '+' : ''}${options.pitch}Hz`;
  }

  // 直接消费 toStream()：msedge-tts 的 toFile() 严格要求收到 turn.end 才算成功，
  // 但 Bing 在短文本 / 网络抖动时会先关闭 socket，导致 "Stream closed before ..."。
  // 这里我们自己缓冲 chunks，close 后只要有音频数据就视为成功，忽略 turn.end 缺失。
  const attempt = async (): Promise<Buffer> => {
    const tts = new mod.MsEdgeTTS();
    try {
      await tts.setMetadata(cleanedVoice, format, { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false });
      const streamHandle: any = tts.toStream(cleanedText, prosody);
      const audioStream: any = streamHandle?.audioStream || streamHandle;
      if (!audioStream || typeof audioStream.on !== 'function') {
        throw new Error('msedge-tts 未返回可读音频流');
      }
      const chunks: Buffer[] = [];
      let sawError: Error | null = null;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          try { audioStream.destroy(new Error('Edge TTS 超时（60s）')); } catch {}
          reject(new Error('Edge TTS 超时（60s）'));
        }, 60000);
        audioStream.on('data', (chunk: Buffer) => {
          try { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); } catch {}
        });
        audioStream.on('error', (err: Error) => {
          // 只记录，不立即拒绝——若 chunks 已有数据，close 时按成功处理
          sawError = err;
        });
        audioStream.on('close', () => {
          clearTimeout(timer);
          if (chunks.length > 0) return resolve();
          reject(sawError || new Error('未收到任何音频数据'));
        });
        audioStream.on('end', () => {
          clearTimeout(timer);
          if (chunks.length > 0) return resolve();
          reject(sawError || new Error('未收到任何音频数据'));
        });
      });
      return Buffer.concat(chunks);
    } finally {
      try { tts.close?.(); } catch {}
    }
  };

  let audioBuf: Buffer | null = null;
  let lastErr: any = null;
  for (let i = 0; i < 2; i++) {
    try {
      audioBuf = await attempt();
      break;
    } catch (err) {
      lastErr = err;
      // 短暂退避后再试一次（网络抖动时有效）
      await new Promise(r => setTimeout(r, 400));
    }
  }
  if (!audioBuf) {
    throw new Error('Edge TTS 在线合成失败：' + (lastErr?.message || String(lastErr)));
  }

  try {
    fs.writeFileSync(audioPath, audioBuf);
  } catch (err: any) {
    throw new Error('写入 TTS 音频文件失败：' + (err?.message || String(err)));
  }

  const duration = await getAudioDuration(audioPath).catch(() => 0);
  return {
    audioPath,
    subtitlePath: fs.existsSync(subtitlePath) ? subtitlePath : undefined,
    duration,
  };
}

// 获取音频时长
// 缓存 ffprobe 探测结果，避免每次 TTS 都反复 spawn 失败并触发子进程 socket 异常
let __ffprobeAvailable: boolean | null = null;

async function getAudioDuration(audioPath: string): Promise<number> {
  if (__ffprobeAvailable === false) return 0;
  return new Promise<number>((resolve) => {
    let settled = false;
    const done = (n: number) => { if (!settled) { settled = true; resolve(n); } };
    let child: ReturnType<typeof spawn> | null = null;
    try {
      child = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        audioPath,
      ], { windowsHide: true });
    } catch {
      __ffprobeAvailable = false;
      return done(0);
    }
    if (!child) { __ffprobeAvailable = false; return done(0); }

    let stdout = '';
    const to = setTimeout(() => { try { child?.kill('SIGTERM'); } catch {} done(0); }, 8000);

    // 关键：spawn 阶段（ENOENT / ENOTCONN 之类）走的是 error 事件，不会抛异常
    child.on('error', () => { __ffprobeAvailable = false; clearTimeout(to); done(0); });
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stdout?.on('error', () => {});
    child.stderr?.on('error', () => {});
    child.on('close', (code) => {
      clearTimeout(to);
      if (__ffprobeAvailable === null) __ffprobeAvailable = true;
      if (code !== 0) return done(0);
      const n = parseFloat(stdout.trim());
      done(Number.isFinite(n) ? n : 0);
    });
  });
}

// 读取文件为 Base64
async function readFileAsBase64(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

// ==================== FFmpeg 视频渲染 ====================

interface RenderVideoParams {
  videoFiles: string[];
  timeRanges: [string, string][];
  audioFiles?: {
    voice?: string;
    bgm?: string;
  };
  subtitleFile?: string;
  outputSize: {
    width: number;
    height: number;
  };
  outputDuration: string;
  outputPath: string;
}

interface ExecuteFFmpegResult {
  stdout: string;
  stderr: string;
  code: number;
  /** 实际产物路径（由 renderVideo 填充；ffmpeg 去重后可能不同于入参 outputPath） */
  outputPath?: string;
}

async function executeFFmpeg(
  args: string[],
  options?: {
    cwd?: string;
    onProgress?: (progress: number) => void;
    abortSignal?: AbortSignal;
  }
): Promise<ExecuteFFmpegResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, {
      cwd: options?.cwd || process.cwd(),
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let progress = 0;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      // 解析进度
      const timeMatch = data.toString().match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;
        // 假设总时长为 60 秒（实际应该从参数获取）
        progress = Math.min((currentTime / 60) * 100, 99);
        options?.onProgress?.(progress);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        options?.onProgress?.(100);
        resolve({ stdout, stderr, code: 0 });
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start FFmpeg: ${error.message}`));
    });

    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        child.kill('SIGTERM');
      });
    }
  });
}

async function renderVideo(
  params: RenderVideoParams & {
    onProgress?: (progress: number) => void;
    abortSignal?: AbortSignal;
  }
): Promise<ExecuteFFmpegResult> {
  const { videoFiles, timeRanges, audioFiles, subtitleFile, outputSize, outputDuration, outputPath, onProgress } = params;

  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  // 生成唯一文件名避免覆盖
  const uniqueOutputPath = generateUniqueFileName(outputPath);

  const args: string[] = [];

  // 添加所有视频输入
  videoFiles.forEach((file) => {
    args.push('-i', file);
  });

  // 添加音频输入
  if (audioFiles?.voice) {
    args.push('-i', audioFiles.voice);
  }
  if (audioFiles?.bgm) {
    args.push('-i', audioFiles.bgm);
  }

  // 构建复杂滤镜
  const filters: string[] = [];
  const videoStreams: string[] = [];

  // 处理每个视频片段
  videoFiles.forEach((_, index) => {
    const [start, end] = timeRanges[index];
    const streamLabel = `v${index}`;
    videoStreams.push(streamLabel);

    filters.push(
      `[${index}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=${outputSize.width}:${outputSize.height}:force_original_aspect_ratio=decrease,pad=${outputSize.width}:${outputSize.height}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,setsar=1[${streamLabel}]`
    );
  });

  // 拼接视频
  filters.push(`[${videoStreams.join('][')}]concat=n=${videoFiles.length}:v=1:a=0[vconcat]`);

  // 重置时间基、帧率、色彩空间
  filters.push(`[vconcat]fps=30,format=yuv420p,setpts=PTS-STARTPTS[vout]`);

  // 添加字幕
  if (subtitleFile && fs.existsSync(subtitleFile)) {
    filters.push(`[vout]subtitles=${subtitleFile.replace(/:/g, '\\:')}[with_subs]`);
  } else {
    filters.push(`[vout]copy[with_subs]`);
  }

  // 音频处理
  const voiceInputIndex = videoFiles.length;
  const bgmInputIndex = audioFiles?.voice ? voiceInputIndex + 1 : voiceInputIndex;

  if (audioFiles?.voice) {
    filters.push(`[${voiceInputIndex}:a]volume=2[voice]`);
  }
  if (audioFiles?.bgm) {
    filters.push(`[${bgmInputIndex}:a]volume=0.5[bgm]`);
  }

  // 混合音频
  if (audioFiles?.voice && audioFiles?.bgm) {
    filters.push(`[voice][bgm]amix=inputs=2:duration=longest[aout]`);
  } else if (audioFiles?.voice) {
    filters.push(`[voice]amix=inputs=1:duration=longest[aout]`);
  } else if (audioFiles?.bgm) {
    filters.push(`[bgm]amix=inputs=1:duration=longest[aout]`);
  }

  // 设置 filter_complex
  args.push('-filter_complex', filters.join(';'));

  // 映射输出流
  args.push('-map', '[with_subs]');
  if (audioFiles?.voice || audioFiles?.bgm) {
    args.push('-map', '[aout]');
  }

  // 编码参数
  args.push(
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-fps_mode', 'cfr',
    '-s', `${outputSize.width}x${outputSize.height}`,
    '-progress', 'pipe:1',
    '-t', outputDuration,
    '-stats',
    '-y',
    uniqueOutputPath
  );

  const execResult = await executeFFmpeg(args, { onProgress, abortSignal: params.abortSignal });
  // 回传真实输出路径：ffmpeg 通过 generateUniqueFileName 可能改写了文件名，
  // 调用方（画布视频合成/字幕节点、剧创导出）需要知道最终产物落在哪里。
  return { ...execResult, outputPath: uniqueOutputPath };
}

function generateUniqueFileName(filePath: string): string {
  if (!fs.existsSync(filePath)) return filePath;
  
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  
  let counter = 1;
  let newPath = filePath;
  
  while (fs.existsSync(newPath)) {
    newPath = path.join(dir, `${base}_${counter}${ext}`);
    counter++;
  }
  
  return newPath;
}

// ==================== 文件系统辅助 ====================

interface ListFilesFromFolderOptions {
  folderPath: string;
  extensions?: string[];
}

interface FileRecord {
  path: string;
  name: string;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
}

async function listFilesFromFolder(options: ListFilesFromFolderOptions): Promise<FileRecord[]> {
  const { folderPath, extensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'] } = options;
  
  if (!fs.existsSync(folderPath)) {
    return [];
  }
  
  const files = fs.readdirSync(folderPath);
  const records: FileRecord[] = [];
  
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (extensions.includes(ext)) {
      const fullPath = path.join(folderPath, file);
      const stat = fs.statSync(fullPath);
      
      records.push({
        path: fullPath,
        name: file,
        size: stat.size,
      });
    }
  }
  
  return records;
}

// ==================== 注册 IPC 处理器 ====================

export function registerShortVideoFactoryIPC() {
  // Edge TTS - 获取语音列表
  ipcMain.handle('edgeTts:getVoiceList', async () => {
    try {
      const voices = await getEdgeTTSVoiceList();
      return { ok: true, voices };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  // Edge TTS - 合成到文件
  ipcMain.handle('edgeTts:synthesizeToFile', async (_event, params: {
    text: string;
    voice: string;
    options?: { rate?: number; volume?: number; pitch?: number };
    withCaption?: boolean;
  }) => {
    try {
      const result = await synthesizeEdgeTTS(params.text, params.voice, params.options);
      return {
        ok: true,
        audioPath: result.audioPath,
        subtitlePath: result.subtitlePath,
        duration: result.duration,
      };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  // Edge TTS - 合成到 Base64
  ipcMain.handle('edgeTts:synthesizeToBase64', async (_event, params: {
    text: string;
    voice: string;
    options?: { rate?: number; volume?: number; pitch?: number };
  }) => {
    try {
      const result = await synthesizeEdgeTTS(params.text, params.voice, params.options);
      const base64 = await readFileAsBase64(result.audioPath);
      
      // 清理临时文件
      try {
        fs.unlinkSync(result.audioPath);
        if (result.subtitlePath) fs.unlinkSync(result.subtitlePath);
      } catch {}
      
      return { ok: true, base64, duration: result.duration };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  // 视频渲染
  ipcMain.handle('video:render', async (_event, params: RenderVideoParams) => {
    try {
      const result = await renderVideo(params);
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  // 列出文件夹中的文件
  ipcMain.handle('fileSystem:listFilesFromFolder', async (_event, options: ListFilesFromFolderOptions) => {
    try {
      const files = await listFilesFromFolder(options);
      return { ok: true, files };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  // 选择文件夹
  ipcMain.handle('fileSystem:selectFolder', async (_event, options?: { title?: string; defaultPath?: string }) => {
    try {
      const { dialog } = require('electron');
      const result = await dialog.showOpenDialog({
        title: options?.title || '选择文件夹',
        defaultPath: options?.defaultPath,
        properties: ['openDirectory'],
      });
      
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: true, canceled: true };
      }
      
      return { ok: true, folderPath: result.filePaths[0] };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  // 写入临时文本文件（供视频合成节点生成 SRT 字幕文件使用）
  ipcMain.handle('fileSystem:writeTextFile', async (_event, params: { content: string; ext?: string; prefix?: string }) => {
    try {
      const ext = String(params?.ext || 'txt').replace(/^\./, '');
      const prefix = String(params?.prefix || 'text').replace(/[^\w.-]/g, '_');
      const dir = path.join(app.getPath('temp'), 'yijing-ai', 'text');
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `${prefix}_${Date.now()}.${ext}`);
      fs.writeFileSync(filePath, String(params?.content ?? ''), 'utf8');
      return { ok: true, path: filePath };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });

  // 申请一个临时输出文件路径（供视频合成输出使用）
  ipcMain.handle('fileSystem:tempPath', async (_event, params?: { prefix?: string; ext?: string }) => {
    try {
      const ext = String(params?.ext || 'mp4').replace(/^\./, '');
      const prefix = String(params?.prefix || 'out').replace(/[^\w.-]/g, '_');
      const dir = path.join(app.getPath('temp'), 'yijing-ai', 'output');
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `${prefix}_${Date.now()}.${ext}`);
      return { ok: true, path: filePath };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  });
}
