; ----- Custom NSIS macros for 艺镜AI -----
; electron-builder invokes these hooks automatically when defined.

!macro customHeader
  ; 支持静默安装参数（electron-builder已自动加载语言文件，无需重复加载）
!macroend

!macro preInit
  ; 自动检测旧版本安装路径
  SetRegView 64
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\艺镜AI-正式版" "InstallLocation"
  StrCmp $0 "" +2 0
  StrCpy $INSTDIR $0
  
  ; 如果注册表中没有找到，尝试从桌面快捷方式查找
  StrCmp $0 "" 0 +5
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\艺镜AI-正式版" "DisplayIcon"
  StrCmp $0 "" 0 +3
  GetFileName $0 "$0"
  GetParent $INSTDIR "$0"
  
  ; 设置默认安装目录
  StrCmp $0 "" 0 +3
  WriteRegExpandStr HKCU "Software\艺镜AI-正式版" "" "$LOCALAPPDATA\Programs\艺镜AI-正式版"
  SetRegView 32
  WriteRegExpandStr HKCU "Software\艺镜AI-正式版" "" "$LOCALAPPDATA\Programs\艺镜AI-正式版"
!macroend

!macro customInstall
  ; 安装前关闭正在运行的程序
  nsExec::Exec 'taskkill /F /IM "艺镜AI-正式版.exe" 2>nul'
  Pop $0
  
  ; 等待进程完全关闭
  Sleep 1000
  
  DetailPrint "艺镜AI 已成功安装到 $INSTDIR"
!macroend

!macro customUnInstall
  ; 卸载前关闭程序
  nsExec::Exec 'taskkill /F /IM "艺镜AI-正式版.exe" 2>nul'
  Pop $0
  Sleep 500
  
  DetailPrint "正在卸载艺镜AI..."
!macroend
