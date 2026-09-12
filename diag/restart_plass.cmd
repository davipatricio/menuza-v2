@echo off
echo ========================================
echo   RESTARTING PROCESS LASSO
echo   With new prolasso.ini config
echo ========================================
echo.

REM Kill existing instances
echo Stopping existing instances...
taskkill /f /im ProcessGovernor.exe >nul 2>&1
echo [OK] ProcessGovernor stopped
taskkill /f /im ProcessLasso.exe >nul 2>&1
echo [OK] ProcessLasso stopped

REM Wait a moment
timeout /t 2 /nobreak >nul

REM Restart ProcessGovernor (service/core engine) with new config
echo Starting ProcessGovernor with new config...
start "" /B "C:\Program Files\Bitsum\Process Lasso\ProcessGovernor.exe" /ConfigFolder=C:\ProgramData\Bitsum\Process Lasso
echo [OK] ProcessGovernor started

REM Wait a moment
timeout /t 2 /nobreak >nul

REM Restart ProcessLasso GUI with new config
echo Starting ProcessLasso GUI...
start "" /B "C:\Program Files\Bitsum\Process Lasso\ProcessLasso.exe" /ShowWindow /ConfigFolder=C:\Users\davip\AppData\Roaming\Bitsum\Process Lasso /TrimNow
echo [OK] ProcessLasso GUI started

REM Wait for config to load
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo   RESTART COMPLETE
echo ========================================
echo.
echo Verifying rules...
echo.
echo Checking if prolasso.ini is active:
type "C:\Users\davip\AppData\Roaming\Bitsum\Process Lasso\prolasso.ini" | find "DefaultPriorities" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] DefaultPriorities rule found in config
) else (
    echo [FAIL] DefaultPriorities not found
)

echo.
echo To verify rules are WORKING, open Process Lasso GUI
echo and check:
echo   1. brave.exe has priority "Above Normal"
echo   2. Orca.exe has priority "Above Normal"
echo   3. opencode2.exe has priority "Above Normal"
echo   4. CPU affinities are set to all cores (4095)
echo.
echo Or run: ProcessLasso.exe /ShowWindow
echo.
pause
