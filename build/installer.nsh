; ----- Custom NSIS macros for 艺镜AI -----
; electron-builder invokes these hooks automatically when defined.

!macro customHeader
  ; Placeholder — reserved for future customization.
!macroend

!macro preInit
  ; Set default install directory to LocalAppData to avoid UAC prompts.
  SetRegView 64
  WriteRegExpandStr HKCU "Software\\艺镜AI-正式版" "" "$LOCALAPPDATA\\Programs\\艺镜AI-正式版"
  SetRegView 32
  WriteRegExpandStr HKCU "Software\\艺镜AI-正式版" "" "$LOCALAPPDATA\\Programs\\艺镜AI-正式版"
!macroend

!macro customInstall
  ; Register custom URL scheme (optional, safe to keep for future use)
  DetailPrint "艺镜AI 已成功安装到 $INSTDIR"
!macroend

!macro customUnInstall
  ; Optionally clean per-user cache; keep user documents intact
  DetailPrint "正在卸载艺镜AI……"
!macroend
