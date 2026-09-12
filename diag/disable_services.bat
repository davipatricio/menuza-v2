@echo off
REM === DISABLE SERVICES ===
echo ========================================
echo   DISABLING SERVICES
echo ========================================
echo.

sc stop "WSearch" >nul 2>&1
sc config "WSearch" start= disabled >nul 2>&1
echo [DONE] WSearch

sc stop "SysMain" >nul 2>&1
sc config "SysMain" start= disabled >nul 2>&1
echo [DONE] SysMain

sc stop "AMCCrashDefender" >nul 2>&1
sc config "AMCCrashDefender" start= disabled >nul 2>&1
echo [DONE] AMD Crash Defender Service

sc stop "ElevocService" >nul 2>&1
sc config "ElevocService" start= disabled >nul 2>&1
echo [DONE] ElevocService

sc stop "webthreatdefusersvc_31d439" >nul 2>&1
sc config "webthreatdefusersvc_31d439" start= disabled >nul 2>&1
echo [DONE] webthreatdefusersvc_31d439

sc stop "WinDefend" >nul 2>&1
sc config "WinDefend" start= disabled >nul 2>&1
echo [DONE] WinDefend

sc stop "LITSSVC" >nul 2>&1
sc config "LITSSVC" start= disabled >nul 2>&1
echo [DONE] LITSSVC

sc stop "DolbyDAXAPI" >nul 2>&1
sc config "DolbyDAXAPI" start= disabled >nul 2>&1
echo [DONE] DolbyDAXAPI

sc stop "LenovoFnAndFunctionKeys" >nul 2>&1
sc config "LenovoFnAndFunctionKeys" start= disabled >nul 2>&1
echo [DONE] LenovoFnAndFunctionKeys

echo.
echo ========================================
echo   VERIFICATION
echo ========================================
sc query "WSearch" | find "STATE" >nul 2>&1
sc query "SysMain" | find "STATE" >nul 2>&1
sc query "WinDefend" | find "STATE" >nul 2>&1
sc query "LITSSVC" | find "STATE" >nul 2>&1
sc query "DolbyDAXAPI" | find "STATE" >nul 2>&1
echo.
echo All services stopped and disabled.
echo Some may need reboot to fully stop.
echo Run 'wsl --shutdown' and reboot at end of day.
echo.
pause
