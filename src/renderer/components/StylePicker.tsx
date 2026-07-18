import React, { useState } from 'react';

export type StyleCategory = 'all' | 'midjourney' | 'photography' | 'illustration' | '3d' | 'pixel' | 'anime' | 'custom';

interface StylePreset {
  id: string;
  name: string;
  category: StyleCategory;
  prompt: string; // 风格后缀词
  icon: string;   // emoji
}

const STYLE_PRESETS: StylePreset[] = [
  // Midjourney
  { id: 'mj-001', name: '赛博朋克', category: 'midjourney', prompt: 'cyberpunk, neon lights, futuristic, dark city, rain, --ar 16:9 --v 6', icon: '★' },
  { id: 'mj-002', name: '水彩画', category: 'midjourney', prompt: 'watercolor painting, soft edges, delicate, vibrant colors, --ar 4:3 --style raw', icon: '◆' },
  { id: 'mj-003', name: '蒸汽朋克', category: 'midjourney', prompt: 'steampunk, Victorian, brass gears, airships, ornate, detailed, --v 6', icon: '◇' },
  { id: 'mj-004', name: '宫崎骏风', category: 'midjourney', prompt: 'Ghibli style, Studio Ghibli, Hayao Miyazaki, lush greens, warm sunlight, peaceful countryside', icon: '◆' },
  { id: 'mj-005', name: '油画质感', category: 'midjourney', prompt: 'oil painting, impasto technique, rich textures, dramatic lighting, classical, --style raw', icon: '○' },
  { id: 'mj-006', name: '浮世绘', category: 'midjourney', prompt: 'ukiyo-e style, Japanese woodblock print, flat colors, bold outlines, Edo period, --v 6', icon: '○' },
  // 摄影写真
  { id: 'ph-001', name: '电影感', category: 'photography', prompt: 'cinematic photography, anamorphic lens, bokeh, film grain, 35mm, dramatic lighting, --ar 2.39:1', icon: '◆' },
  { id: 'ph-002', name: '胶片感', category: 'photography', prompt: 'analog photography, Kodak Portra 400, warm tones, grain, shallow depth, vintage', icon: '◇' },
  { id: 'ph-003', name: '人像写真', category: 'photography', prompt: 'professional portrait photography, 85mm lens, soft natural light, clean background, detailed skin', icon: '○' },
  { id: 'ph-004', name: '时尚大片', category: 'photography', prompt: 'fashion editorial, high-end magazine, dramatic lighting, bold colors, couture, --ar 3:4', icon: '★' },
  { id: 'ph-005', name: '城市街拍', category: 'photography', prompt: 'street photography, urban, candid, golden hour, documentary style, Leica, --ar 3:2', icon: '□' },
  { id: 'ph-006', name: '微距摄影', category: 'photography', prompt: 'macro photography, close-up, shallow depth of field, extreme detail, natural light, --ar 1:1', icon: '◉' },
  // 插画
  { id: 'il-001', name: '扁平插画', category: 'illustration', prompt: 'flat illustration, vector art, minimal, clean lines, vibrant colors, modern design', icon: '□' },
  { id: 'il-002', name: '厚涂插画', category: 'illustration', prompt: 'digital painting, thick brush strokes, painterly, rich textures, dramatic light, concept art', icon: '○' },
  { id: 'il-003', name: '古风插画', category: 'illustration', prompt: 'Chinese traditional illustration, ink wash style, hanfu, ancient Chinese aesthetics, elegant, delicate', icon: '◆' },
  { id: 'il-004', name: '儿童绘本', category: 'illustration', prompt: 'children book illustration, storybook style, cute characters, bright colors, whimsical, hand-drawn', icon: '◇' },
  { id: 'il-005', name: '赛博插画', category: 'illustration', prompt: 'cyberpunk illustration, neon colors, digital art, futuristic city, glowing effects, --ar 16:9', icon: '★' },
  // 3D
  { id: '3d-001', name: '3D 渲染', category: '3d', prompt: '3D render, octane render, cinema 4D, soft lighting, clean background, product visualization, 4K', icon: '◆' },
  { id: '3d-002', name: '等距像素', category: '3d', prompt: 'isometric 3D, pixel art, low poly, cute style, clean colors, game asset style', icon: '□' },
  { id: '3d-003', name: '皮克斯风', category: '3d', prompt: 'Pixar style 3D, animated film, expressive characters, ray tracing, vibrant colors, --ar 16:9', icon: '◇' },
  { id: '3d-004', name: '建筑可视化', category: '3d', prompt: 'architectural visualization, 3D perspective, unreal engine, photorealistic, interior design, 8K', icon: '○' },
  // 像素
  { id: 'px-001', name: '像素艺术', category: 'pixel', prompt: 'pixel art, 16-bit, retro game style, vibrant colors, detailed sprites, nostalgic', icon: '□' },
  { id: 'px-002', name: '复古街机', category: 'pixel', prompt: 'retro arcade game art, pixel art, 8-bit, neon colors, classic game style, --ar 4:3', icon: '■' },
  // 动漫
  { id: 'an-001', name: '日漫风', category: 'anime', prompt: 'anime style, cel shading, vibrant, detailed eyes, Studio Bones quality, Japanese animation', icon: '◆' },
  { id: 'an-002', name: '写实日漫', category: 'anime', prompt: 'anime realism, semi-realistic anime, detailed hair, cinematic, dramatic lighting, anime key visual', icon: '★' },
  { id: 'an-003', name: '水彩日漫', category: 'anime', prompt: 'watercolor anime, soft colors, dreamy, gentle lines, Studio Ghibli influenced, ethereal', icon: '○' },
  // 自定义
  { id: 'cu-001', name: '黑白电影', category: 'custom', prompt: 'black and white film, monochrome, film noir, dramatic shadows, classic cinematography, grain', icon: '◇' },
  { id: 'cu-002', name: '宝丽来风', category: 'custom', prompt: 'Polaroid photo, instant camera, white border, warm tones, nostalgic, slightly faded', icon: '○' },
  { id: 'cu-003', name: '双重曝光', category: 'custom', prompt: 'double exposure photography, silhouette overlay, artistic, surreal, detailed composition', icon: '◆' },
  { id: 'cu-004', name: '杂志封面', category: 'custom', prompt: 'magazine cover, editorial photography, bold typography, high contrast, fashion, --ar 3:4', icon: '□' },
];

const CATEGORIES: { id: StyleCategory; label: string; icon: string }[] = [
  { id: 'all', label: '全部', icon: '◆' },
  { id: 'midjourney', label: 'Midjourney', icon: '★' },
  { id: 'photography', label: '摄影写真', icon: '◇' },
  { id: 'illustration', label: '插画', icon: '□' },
  { id: '3d', label: '3D', icon: '○' },
  { id: 'pixel', label: '像素', icon: '■' },
  { id: 'anime', label: '动漫', icon: '◆' },
  { id: 'custom', label: '特殊效果', icon: '★' },
];

interface StylePickerProps {
  onSelect: (promptSuffix: string) => void;
  onClose: () => void;
}

export const StylePicker: React.FC<StylePickerProps> = ({ onSelect, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<StyleCategory>('all');
  const [search, setSearch] = useState('');

  const filtered = STYLE_PRESETS.filter(s => {
    if (activeCategory !== 'all' && s.category !== activeCategory) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="style-picker-overlay" onClick={onClose}>
      <div className="style-picker-panel" onClick={e => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="spk-header">
          <span className="spk-title">风格库</span>
          <button className="spk-close" onClick={onClose}>×</button>
        </div>

        {/* 搜索 */}
        <div className="spk-search">
          <input
            className="spk-search-inp"
            placeholder="搜索风格..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* 分类标签 */}
        <div className="spk-cats">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`spk-cat-btn ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* 风格列表 */}
        <div className="spk-list">
          {filtered.length === 0 && (
            <div className="spk-empty">未找到匹配的风格</div>
          )}
          {filtered.map(style => (
            <button
              key={style.id}
              className="spk-item"
              onClick={() => { onSelect(style.prompt); onClose(); }}
              title={style.prompt}
            >
              <span className="spk-item-icon">{style.icon}</span>
              <div className="spk-item-info">
                <span className="spk-item-name">{style.name}</span>
                <span className="spk-item-prompt">{style.prompt.slice(0, 50)}{style.prompt.length > 50 ? '…' : ''}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
