// 声明第三方模块与静态资源以减少类型噪声
declare module 'file-saver' {
  export function saveAs(data: any, filename?: string): void;
}

declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.svg';

// 通用 any 模块占位（若有更多未声明的第三方包，可在此添加）
declare module '*';
