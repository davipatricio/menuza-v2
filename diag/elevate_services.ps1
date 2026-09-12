@echo off
echo ========================================
echo   ELEVATION: Running svc_disable2.cmd as Administrator
echo ========================================
echo.
echo This will open an elevated PowerShell window.
echo If UAC prompt appears, click Yes to allow.
echo.
timeout /t 3 /nobreak >nul

echo Launching elevated PowerShell...
echo.

powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File \"C:\Users\davip\Documents\Projetos\menuza\diag\svc_disable2.cmd\"'" 2>&1

echo If the UAC dialog appeared and you clicked Yes,
echo the service disabling commands are now running in elevated mode.
echo.
echo If no UAC dialog appeared, you may need to manually run:
echo   C:\Users\davip\Documents\Projetos\menuza\diag\svc_disable2.cmd
echo as Administrator (right-click -> Run as administrator).
echo.
pause
