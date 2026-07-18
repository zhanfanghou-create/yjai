/**
 * Short Video Factory - 依赖检查与安装
 * Edge TTS 走内置在线接口（msedge-tts / 微软 Edge 免费 TTS），无需本机 CLI。
 * 仅 FFmpeg 仍需本机安装（用于视频合成）。
 */

export async function checkDependencies(): Promise<{
  edgeTts: { ok: boolean; error?: string; installHint?: string };
  ffmpeg: { ok: boolean; error?: string; version?: string };
}> {
  const result = {
    edgeTts: { ok: true as boolean, error: undefined as string | undefined, installHint: undefined as string | undefined },
    ffmpeg: { ok: false as boolean, error: undefined as string | undefined, version: undefined as string | undefined },
  };

  // Edge TTS：走微软免费在线接口（内置），无需系统安装
  result.edgeTts.ok = true;

  // 检查 ffmpeg（视频合成必须）
  try {
    const win = window as any;
    if (win?.yijingAPI?.ffmpeg?.check) {
      const r = await win.yijingAPI.ffmpeg.check();
      if (r?.ok) {
        result.ffmpeg.ok = true;
        result.ffmpeg.version = r.version || 'FFmpeg 可用';
      } else {
        result.ffmpeg.ok = false;
        result.ffmpeg.error = r?.error || '未检测到 FFmpeg';
      }
    } else {
      result.ffmpeg.error = '主进程未提供 FFmpeg 检测接口';
    }
  } catch (error) {
    result.ffmpeg.ok = false;
    result.ffmpeg.error = (error as Error).message || '未检测到 FFmpeg';
  }

  return result;
}

// 兼容旧调用：edge-tts 已内置，不需要安装
export async function installEdgeTts(): Promise<{ ok: boolean; log?: string; error?: string }> {
  return { ok: true, log: 'Edge TTS 已内置（微软在线接口），无需安装。' };
}
