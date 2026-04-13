; Custom NSIS uninstaller script
; Force-deletes the installation directory after uninstall

!macro customUnInstall
  ; Remove the installation directory and all its contents
  RMDir /r "$INSTDIR"
!macroend
