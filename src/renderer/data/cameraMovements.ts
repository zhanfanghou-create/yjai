export interface CameraMovement {
  id: string;
  name: string;
  promptEn: string;
  promptZh: string; // 专业级中文提示词，用于API提交
  imagePath: string;
}

// 获取运镜图片的完整路径（支持 Electron 环境）
export function getCameraMovementImagePath(filename: string): string {
  // 使用相对路径，Electron 和 Web 都兼容
  return `./运镜/${filename}`;
}

export const CAMERA_MOVEMENTS: CameraMovement[] = [
  {
    id: 'static',
    name: '固定镜头',
    promptEn: 'Static shot, camera remains completely stationary, no movement.',
    promptZh: '固定机位拍摄，摄像机完全静止不动，画面稳定无抖动，适合表现静态场景或人物内心情绪，营造沉稳、客观的视觉氛围。',
    imagePath: '固定镜头.webp'
  },
  {
    id: 'follow',
    name: '跟随拍摄',
    promptEn: 'Follow shot, camera tracks and follows subject movement smoothly.',
    promptZh: '跟随拍摄，摄像机平滑追踪主体移动，保持主体在画面中心位置，背景产生动态模糊，营造紧张感和代入感，适合运动场景或追逐戏。',
    imagePath: '跟随拍摄.webp'
  },
  {
    id: 'spiral-ascent',
    name: '盘旋抬升',
    promptEn: 'Spiral ascent, camera circles upward around subject in a rising spiral.',
    promptZh: '螺旋上升拍摄，摄像机围绕主体做螺旋式上升运动，同时逐渐抬高机位，展现主体与环境的层次关系，营造史诗感和视觉冲击力。',
    imagePath: '盘旋抬升.webp'
  },
  {
    id: 'spiral-descent',
    name: '盘旋下降',
    promptEn: 'Spiral descent, camera circles downward around subject in a descending spiral.',
    promptZh: '螺旋下降拍摄，摄像机围绕主体做螺旋式下降运动，同时降低机位，逐渐聚焦于主体细节，营造神秘感和压迫感。',
    imagePath: '盘旋下降.webp'
  },
  {
    id: 'tilt-up',
    name: '镜头上摇',
    promptEn: 'Tilt up, camera tilts upward revealing more of the scene from low to high.',
    promptZh: '镜头上摇，摄像机从低角度向上仰拍，逐渐展现场景的高大雄伟，适合表现建筑、树木或人物的威严感，营造崇敬或震撼的情绪。',
    imagePath: '镜头上摇.webp'
  },
  {
    id: 'tilt-down',
    name: '镜头下摇',
    promptEn: 'Tilt down, camera tilts downward revealing more of the scene from high to low.',
    promptZh: '镜头下摇，摄像机从高角度向下俯拍，逐渐展现场景的广阔或渺小，适合表现俯视视角，营造掌控感或孤独感。',
    imagePath: '镜头下摇.webp'
  },
  {
    id: 'pan-left',
    name: '镜头左摇',
    promptEn: 'Pan left, camera pans horizontally to the left side.',
    promptZh: '镜头左摇，摄像机水平向左平移，展现场景的横向延展，适合表现风景、建筑群或人物横向移动，营造空间感和连续性。',
    imagePath: '镜头左摇.webp'
  },
  {
    id: 'pan-right',
    name: '镜头右摇',
    promptEn: 'Pan right, camera pans horizontally to the right side.',
    promptZh: '镜头右摇，摄像机水平向右平移，展现场景的横向延展，适合表现风景、建筑群或人物横向移动，营造空间感和连续性。',
    imagePath: '镜头右摇.webp'
  },
  {
    id: 'crane-up',
    name: '镜头上升',
    promptEn: 'Crane up, camera rises vertically upward for an elevated view.',
    promptZh: '镜头上升，摄像机垂直向上运动，机位逐渐抬高，展现更广阔的视野和环境关系，适合表现场景的宏大或人物的情绪升华。',
    imagePath: '镜头上升.webp'
  },
  {
    id: 'crane-down',
    name: '镜头下降',
    promptEn: 'Crane down, camera descends vertically downward from an elevated position.',
    promptZh: '镜头下降，摄像机垂直向下运动，机位逐渐降低，聚焦于地面或低处的主体，适合表现细节或营造亲近感。',
    imagePath: '镜头下降.webp'
  },
  {
    id: 'truck-left',
    name: '镜头左移',
    promptEn: 'Truck left, camera moves horizontally to the left side.',
    promptZh: '镜头左移，摄像机整体向左平移，保持镜头方向不变，展现场景的侧面细节，适合表现人物侧面或环境层次。',
    imagePath: '镜头左移.webp'
  },
  {
    id: 'truck-right',
    name: '镜头右移',
    promptEn: 'Truck right, camera moves horizontally to the right side.',
    promptZh: '镜头右移，摄像机整体向右平移，保持镜头方向不变，展现场景的侧面细节，适合表现人物侧面或环境层次。',
    imagePath: '镜头右移.webp'
  },
  {
    id: 'dolly-in',
    name: '镜头前推',
    promptEn: 'Dolly in, camera moves closer to subject for intimate detail.',
    promptZh: '推镜头拍摄，摄像机向前推进靠近主体，画面逐渐聚焦于细节，营造紧张感、亲密感或强调某个重要元素。',
    imagePath: '镜头前推.webp'
  },
  {
    id: 'dolly-out',
    name: '镜头后移',
    promptEn: 'Dolly out, camera moves away from subject revealing wider context.',
    promptZh: '拉镜头拍摄，摄像机向后拉远远离主体，画面逐渐展现更广阔的环境，营造疏离感、孤独感或交代场景背景。',
    imagePath: '镜头后移.webp'
  },
  {
    id: 'zoom-in',
    name: '变焦推进',
    promptEn: 'Zoom in, lens zooms closer to subject creating a magnifying effect.',
    promptZh: '变焦推进，通过镜头变焦放大主体，画面快速聚焦于目标，背景压缩感增强，营造紧迫感或强调细节。',
    imagePath: '变焦推进.webp'
  },
  {
    id: 'zoom-out',
    name: '变焦拉远',
    promptEn: 'Zoom out, lens zooms away from subject revealing expansive view.',
    promptZh: '变焦拉远，通过镜头变焦缩小画面，展现更广阔的场景，背景扩展，适合交代环境或营造豁然开朗的感觉。',
    imagePath: '边角拉远.webp'
  },
  {
    id: 'dolly-zoom',
    name: '柯克变焦',
    promptEn: 'Dolly zoom, vertigo effect achieved with simultaneous dolly movement and zoom.',
    promptZh: '希区柯克变焦（滑动变焦），摄像机移动的同时反向变焦，背景产生夸张的透视变化，营造眩晕、不安或超现实的视觉效果。',
    imagePath: '柯克变焦.webp'
  },
  {
    id: 'orbit',
    name: '环绕拍摄',
    promptEn: 'Orbit shot, camera circles 360 degrees around subject maintaining constant focus.',
    promptZh: '环绕拍摄，摄像机围绕主体做360度圆周运动，保持主体在画面中心，背景产生旋转效果，营造环绕感和立体感。',
    imagePath: '环绕拍摄.webp'
  },
  {
    id: 'barrel-roll',
    name: '滚筒旋转',
    promptEn: 'Barrel roll, camera rotates 360 degrees around its lens axis producing a rolling effect.',
    promptZh: '滚筒旋转，摄像机沿镜头轴线做360度旋转，画面产生翻滚效果，营造失重感、眩晕感或动感十足的视觉冲击。',
    imagePath: '滚筒旋转.webp'
  },
  {
    id: 'pov',
    name: '第一视角',
    promptEn: 'POV shot, first-person perspective camera simulating subject point of view.',
    promptZh: '第一人称视角拍摄，模拟人物主观视角，画面随头部自然晃动，营造强烈的代入感和沉浸感，适合表现角色的主观体验。',
    imagePath: '第一视角.webp'
  },
  {
    id: 'drone',
    name: '无人机',
    promptEn: 'Drone shot, aerial view from high altitude with sweeping motion.',
    promptZh: '无人机航拍，高空俯瞰视角，画面宏大开阔，可做平滑的推拉摇移，适合展现地形地貌、城市景观或大型场景。',
    imagePath: '无人机.webp'
  },
  {
    id: 'aerial',
    name: '高空航拍',
    promptEn: 'Aerial shot, bird eye view from above capturing expansive landscape.',
    promptZh: '高空俯拍，垂直向下的鸟瞰视角，展现地面布局和空间关系，营造上帝视角的宏观感和疏离感。',
    imagePath: '高空航拍.webp'
  },
  {
    id: 'handheld',
    name: '手持拍摄',
    promptEn: 'Handheld shot, natural camera shake and movement for intimate documentary feel.',
    promptZh: '手持摄影，摄像机自然晃动，画面带有轻微的抖动和不规则运动，营造纪实感、临场感和真实感，适合纪录片或紧张场景。',
    imagePath: '手持拍摄.webp'
  },
];

export const VIDEO_RATIO_OPTIONS = [
  { id: 'auto', label: 'Auto' },
  { id: '16:9', label: '16:9' },
  { id: '4:3', label: '4:3' },
  { id: '1:1', label: '1:1' },
  { id: '3:4', label: '3:4' },
  { id: '9:16', label: '9:16' },
  { id: '21:9', label: '21:9' },
];

export const VIDEO_CLARITY_OPTIONS = ['480P', '720P', '1080P', '4K'];
