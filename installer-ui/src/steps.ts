export type StepKey =
  | "welcome"
  | "license"
  | "mode"
  | "directory"
  | "installing"
  | "finish";

export interface StepDef {
  key: StepKey;
  label: string;
  index: number;
}

export const STEPS: StepDef[] = [
  { key: "welcome",    label: "欢迎",         index: 0 },
  { key: "license",    label: "许可协议",     index: 1 },
  { key: "mode",       label: "安装模式",     index: 2 },
  { key: "directory",  label: "选择目录",     index: 3 },
  { key: "installing", label: "正在安装",     index: 4 },
  { key: "finish",     label: "完成安装",     index: 5 }
];