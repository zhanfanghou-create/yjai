; ----- Custom NSIS macros for Yijing AI -----
; electron-builder invokes these hooks automatically when defined.
; Encoding: UTF-8 without BOM

!macro preInit
  ; 自动检测旧版本安装目录
  SetRegView 64
  
  ; 先尝试从HKCU读取
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\艺镜AI-正式版" "InstallLocation"
  StrCmp $0 "" +2 0
  StrCpy $INSTDIR $0
  
  ; 如果HKCU没有找到，尝试从HKLM读取
  StrCmp $0 "" 0 +3
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\艺镜AI-正式版" "InstallLocation"
  StrCmp $0 "" +2 0
  StrCpy $INSTDIR $0
  
  ; 如果HKLM也没有找到，尝试从WOW6432Node读取
  StrCmp $0 "" 0 +3
  ReadRegStr $0 HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\艺镜AI-正式版" "InstallLocation"
  StrCmp $0 "" +2 0
  StrCpy $INSTDIR $0
  
  SetRegView 32
!macroend

!macro customInstall
  ; 安装前关闭正在运行的程序
  nsExec::Exec 'taskkill /F /IM "YijingAI-Setup.exe" 2>nul'
  Pop $0
  Sleep 500
!macroend