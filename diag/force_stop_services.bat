@echo off
echo ========================================
echo   FORCE STOP & DISABLE SERVICES
echo ========================================
echo.

REM Stop Windows Module Installer first (protects some services)
sc stop "TrustInstaller" >nul 2>&1
sc config "TrustInstaller" start= disabled >nul 2>&1
echo [DISABLED] TrustInstaller (Windows Module Installer)

REM Force kill and stop each service
echo Stopping services...

REM WSearch
taskkill /f /im SearchIndexer.exe >nul 2>&1
taskkill /f /im SearchUI.exe >nul 2>&1
taskkill /f /im SearchApp.exe >nul 2>&1
sc stop "WSearch" >nul 2>&1
sc config "WSearch" start= disabled >nul 2>&1
echo [DONE] WSearch

REM SysMain
sc stop "SysMain" >nul 2>&1
sc config "SysMain" start= disabled >nul 2>&1
echo [DONE] SysMain

REM WinDefend
taskkill /f /im MsMpEng.exe >nul 2>&1
taskkill /f /im SecurityHealthSystray.exe >nul 2>&1
sc stop "WinDefend" >nul 2>&1
sc config "WinDefend" start= disabled >nul 2>&1
echo [DONE] WinDefend

REM LITSSVC
sc stop "LITSSVC" >nul 2>&1
sc config "LITSSVC" start= disabled >nul 2>&1
echo [DONE] LITSSVC

REM DolbyDAXAPI
sc stop "DolbyDAXAPI" >nul 2>&1
sc config "DolbyDAXAPI" start= disabled >nul 2>&1
echo [DONE] DolbyDAXAPI

REM ElevocService
sc stop "ElevocService" >nul 2>&1
sc config "ElevocService" start= disabled >nul 2>&1
echo [DONE] ElevocService

REM AMD Crash Defender
taskkill /f /im amdcrashdefender.exe >nul 2>&1
sc stop "AMCCrashDefender" >nul 2>&1
sc config "AMCCrashDefender" start= disabled >nul 2>&1
echo [DONE] AMD Crash Defender Service

REM webthreatdefusersvc_31d439
sc stop "webthreatdefusersvc_31d439" >nul 2>&1
sc config "webthreatdefusersvc_31d439" start= disabled >nul 2>&1
echo [DONE] webthreatdefusersvc_31d439

REM LenovoFnAndFunctionKeys
sc stop "LenovoFnAndFunctionKeys" >nul 2>&1
sc config "LenovoFnAndFunctionKeys" start= disabled >nul 2>&1
echo [DONE] LenovoFnAndFunctionKeys

echo.
echo ========================================
echo   VERIFICATION (3 second wait)
echo ========================================
echo.
ping -n 1 127.0.0.1 >nul 2>&1
echo Checking current state...
echo.
sc query WSearch | findstr STATE
sc query SysMain | findstr STATE
sc query WinDefend | findstr STATE
sc query LITSSVC | findstr STATE
sc query DolbyDAXAPI | findstr STATE
echo.
echo If services are still RUNNING, they will be fully stopped after reboot.
echo Startup type is DISABLED - they won't come back on boot.
echo.
echo IMPORTANT: Reboot at end of day for full effect.
echo.
pause
