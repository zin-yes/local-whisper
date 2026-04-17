!macro customInstall
  ; Add to Windows startup via registry
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LocalWhisper" "$INSTDIR\Local Whisper.exe"
!macroend

!macro customUnInstall
  ; Remove from Windows startup
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LocalWhisper"
!macroend
