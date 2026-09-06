/**
 * 艺镜内置 ComfyUI 工作流定义
 * 
 * 这些工作流是预先搭建好、测试通过的标准结构，用户选择"内置工作流"后，
 * 软件会把工作流 JSON + 用户参数（提示词/尺寸/参考图等）提交到用户配置的 ComfyUI 地址生成。
 * 
 * 关键设计：
 * - 负向提示词使用独立的 CLIPTextEncode 节点，直接连 KSampler.negative，不会被 ConditioningZeroOut 归零
 * - 模型文件名使用占位符，运行时自动检测用户 ComfyUI 服务器上的可用模型并匹配替换
 * - 参数注入位置固定（节点 ID 约定），便于主进程统一注入
 */

// 节点 ID 约定（参数注入时按这些固定 ID 定位）
export const BUILTIN_NODE_IDS = {
  ASSET_IMAGE: {
    UNET_LOADER: '1',
    CLIP_LOADER: '2',
    VAE_LOADER: '3',
    POSITIVE_CLIP: '4',
    NEGATIVE_CLIP: '5',
    EMPTY_LATENT: '6',
    KSAMPLER: '7',
    VAE_DECODE: '8',
    SAVE_IMAGE: '9',
  },
  VIDEO_H3: {
    UNET_LOADER: '1',
    SIGMA_SHIFT: '2',
    CLIP_LOADER: '3',
    VAE_VIDEO: '4',
    VAE_AUDIO: '5',
    LOAD_IMAGE: '6',
    REF_TO_VIDEO: '7',
    NEGATIVE_ZERO: '8',
    KSAMPLER: '9',
    VAE_DECODE: '10',
    VAE_DECODE_AUDIO: '12',
    SAVE_VIDEO: '11',
  },
};

/**
 * 内置资产图生成工作流（标准文生图结构）
 * 
 * 模型：z_image_turbo（可自动替换为用户服务器上的其他图像模型）
 * 特点：独立负向 CLIPTextEncode 节点，纯白背景强化，cfg/steps 可动态调整
 * 
 * 运行时注入：
 * - node 4 (CLIPTextEncode): text = 正向提示词
 * - node 5 (CLIPTextEncode): text = 负向提示词
 * - node 6 (EmptyLatentImage): width/height = 尺寸
 * - node 7 (KSampler): seed/steps/cfg/sampler_name/scheduler = 采样参数
 * - node 1 (UNETLoader): unet_name = 自动匹配的模型文件名
 * - node 2 (CLIPLoader): clip_name = 自动匹配的 CLIP 文件名
 * - node 3 (VAELoader): vae_name = 自动匹配的 VAE 文件名
 */
export const BUILTIN_ASSET_IMAGE_WORKFLOW: Record<string, any> = {
  '1': {
    class_type: 'UNETLoader',
    inputs: {
      unet_name: 'z_image/z_image_turbo_bf16.safetensors',
      weight_dtype: 'default',
    },
  },
  '2': {
    class_type: 'CLIPLoader',
    inputs: {
      clip_name: 'qwen_3_4b.safetensors',
      type: 'qwen_image',
    },
  },
  '3': {
    class_type: 'VAELoader',
    inputs: {
      vae_name: 'ae.safetensors',
    },
  },
  '4': {
    class_type: 'CLIPTextEncode',
    inputs: {
      text: '', // 运行时注入正向提示词
      clip: ['2', 0],
    },
  },
  '5': {
    class_type: 'CLIPTextEncode',
    inputs: {
      text: '', // 运行时注入负向提示词（独立节点，不会被归零）
      clip: ['2', 0],
    },
  },
  '6': {
    class_type: 'EmptyLatentImage',
    inputs: {
      width: 1024,
      height: 1024,
      batch_size: 1,
    },
  },
  '7': {
    class_type: 'KSampler',
    inputs: {
      model: ['1', 0],
      positive: ['4', 0],
      negative: ['5', 0],
      latent_image: ['6', 0],
      seed: 0,
      steps: 20,
      cfg: 7.0,
      sampler_name: 'euler',
      scheduler: 'normal',
      denoise: 1.0,
    },
  },
  '8': {
    class_type: 'VAEDecode',
    inputs: {
      samples: ['7', 0],
      vae: ['3', 0],
    },
  },
  '9': {
    class_type: 'SaveImage',
    inputs: {
      images: ['8', 0],
      filename_prefix: 'yijing_asset',
    },
  },
};

/**
 * 内置 MiniMax H3 全能参考视频生成工作流
 *
 * 模型：minimax_h3_ref2va（全能参考，支持图片/视频/音频多种参考）
 * 特点：
 * - 支持人物/场景/道具资产图片直接作为参考图生成视频（最多9张）
 * - 支持最多3个参考视频、3个参考音频（全能参考）
 * - MiniMaxH3SigmaShift 进行模型参数偏移
 * - ConditioningZeroOut 作为负向条件
 * - 自带音频输出（VAEDecodeAudio）
 * - VHS_VideoCombine 输出 MP4
 *
 * 运行时注入：
 * - node 6 (LoadImage): image = 资产参考图文件名（人物/场景/道具）
 * - node 7 (MiniMaxH3ReferenceToVideo): prompt = 提示词（含@台词解析后的动作描述）, width/height/length = 尺寸帧数（@时长转换）, ref_images = 资产参考图列表
 * - node 9 (KSampler): seed/steps/cfg = 采样参数
 * - node 1 (UNETLoader): unet_name = 自动匹配的模型文件名
 * - node 3 (CLIPLoader): clip_name = 自动匹配的 CLIP 文件名
 * - node 4 (VAELoader): vae_name = 自动匹配的视频 VAE 文件名
 * - node 5 (VAELoader): vae_name = 自动匹配的音频 VAE 文件名
 */
export const BUILTIN_VIDEO_H3_WORKFLOW: Record<string, any> = {
  '1': {
    class_type: 'UNETLoader',
    inputs: {
      unet_name: 'minimax_h3_ref2va_int8_convrot.safetensors',
      weight_dtype: 'default',
    },
  },
  '2': {
    class_type: 'MiniMaxH3SigmaShift',
    inputs: {
      model: ['1', 0],
      shift_video: 12.0,
      shift_audio: 3.0,
    },
  },
  '3': {
    class_type: 'CLIPLoader',
    inputs: {
      clip_name: 'qwen3vl_32b_minimax_h3_int8_convrot.safetensors',
      type: 'minimax',
    },
  },
  '4': {
    class_type: 'VAELoader',
    inputs: {
      vae_name: 'minimax_h3_video_vae_fp16.safetensors',
    },
  },
  '5': {
    class_type: 'VAELoader',
    inputs: {
      vae_name: 'minimax_h3_audio_vae_fp32.safetensors',
    },
  },
  '6': {
    class_type: 'LoadImage',
    inputs: {
      image: '', // 运行时注入参考图文件名
      upload: 'image',
    },
  },
  '7': {
    class_type: 'MiniMaxH3ReferenceToVideo',
    inputs: {
      clip: ['3', 0],
      vae: ['4', 0],
      audio_vae: ['5', 0],
      prompt: '', // 运行时注入提示词
      width: 1344,
      height: 768,
      length: 124, // 24fps, 约5秒
      ref_image_size: 'match',
      ref_images: [['6', 0]], // 运行时注入参考图列表
    },
  },
  '8': {
    class_type: 'ConditioningZeroOut',
    inputs: {
      conditioning: ['7', 0],
    },
  },
  '9': {
    class_type: 'KSampler',
    inputs: {
      model: ['2', 0],
      positive: ['7', 0],
      negative: ['8', 0],
      latent_image: ['7', 1],
      seed: 0,
      steps: 30,
      cfg: 3.5,
      sampler_name: 'euler',
      scheduler: 'simple',
      denoise: 1.0,
    },
  },
  '10': {
    class_type: 'VAEDecode',
    inputs: {
      samples: ['9', 0],
      vae: ['4', 0],
    },
  },
  '12': {
    class_type: 'VAEDecodeAudio',
    inputs: {
      samples: ['9', 0],
      vae: ['5', 0],
    },
  },
  '11': {
    class_type: 'VHS_VideoCombine',
    inputs: {
      images: ['10', 0],
      audio: ['12', 0],
      frame_rate: 24,
      loop_count: 0,
      filename_prefix: 'yijing_h3_video',
      format: 'video/h264-mp4',
      pix_fmt: 'yuv420p',
      crf: 19,
      save_metadata: true,
      pingpong: false,
      save_output: true,
    },
  },
};

export type BuiltinWorkflowType = 'asset_image' | 'minimax_h3_video';

/**
 * 内置工作流注册表
 */
export const BUILTIN_WORKFLOWS: Record<BuiltinWorkflowType, {
  name: string;
  description: string;
  workflow: Record<string, any>;
  category: 'image' | 'video';
}> = {
  asset_image: {
    name: '艺镜内置·资产图生成',
    description: '标准文生图结构，独立负向提示词节点，支持角色三视图/场景四宫格/道具纯白背景',
    workflow: BUILTIN_ASSET_IMAGE_WORKFLOW,
    category: 'image',
  },
  minimax_h3_video: {
    name: '艺镜内置·MiniMax H3 全能参考视频',
    description: '支持最多9张参考图+3个参考视频+3个参考音频，全能参考生成视频，输出MP4',
    workflow: BUILTIN_VIDEO_H3_WORKFLOW,
    category: 'video',
  },
};
