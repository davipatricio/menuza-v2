@echo off
echo ========================================
echo   ELEVATE & DISABLE SERVICES
echo   Run as Administrator
echo ========================================
echo.
echo This script requires Administrator privileges.
echo If UAC appears, click Yes.
echo.
timeout /t 2 /nobreak >nul

REM Try to elevate and run
powershell -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c C:\Users\davip\Documents\Projetos\menuza\diag\svc_disable2.cmd'" 2>&1

REM If that didn't work, try PowerShell directly
if %errorlevel% neq 0 (
    echo Elevation failed. Trying PowerShell...
    powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File C:\Users\davip\Documents\Projetos\menuza\diag\svc_disable2.cmd'" 2>&1
)

echo.
echo If UAC dialog appeared and you clicked Yes,
echo the service disabling is running in elevated mode.
echo.
echo IMPORTANT: You need to REBOOT after this completes.
echo Run 'wsl --shutdown' before rebooting.
echo.
pause
