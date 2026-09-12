@echo off
echo =======================================
echo   RESTARTING PROCESS LASSO
echo   With corrected prolasso.ini
echo   (Comma-delimited DefaultPriorities)
echo =======================================
echo.

REM Kill existing instances
echo Killing existing instances...
taskkill /f /im ProcessGovernor.exe >nul 2>&1
taskkill /f /im ProcessLasso.exe >nul 2>&1
echo [OK] All instances killed.

REM Restart ProcessGovernor service
echo.
echo Restarting ProcessGovernor service...
net stop ProcessGovernor >nul 2>&1
net start ProcessGovernor >nul 2>&1
echo [OK] ProcessGovernor restarted.

REM Wait for service to load config
echo Waiting 5 seconds for config to load...
timeout /t 5 /nobreak >nul

REM Kill and restart ProcessLasso GUI
echo Killing ProcessLasso GUI...
taskkill /f /im ProcessLasso.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo Starting ProcessLasso GUI...
start "" "C:\Program Files\Process Lasso\ProcessLasso.exe"
echo [OK] ProcessLasso GUI started.

REM Wait for config to load
echo Waiting 5 seconds for rules to apply...
timeout /t 5 /nobreak >nul

echo.
echo =======================================
echo   RESTART COMPLETE
echo =======================================
echo.
echo Checking if rules are now applied...
echo.
echo brave.exe priorities:
powershell -Command "Get-Process -Name brave -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,BasePriority | Select-Object -First 5" 2>&1
echo.
echo Orca.exe priorities:
powershell -Command "Get-Process -Name Orca -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,BasePriority | Select-Object -First 5" 2>&1
echo.
echo opencode2.exe priorities:
powershell -Command "Get-Process -Name opencode2 -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,BasePriority | Select-Object -First 5" 2>&1
echo.
echo =======================================
echo   VERIFICATION COMPLETE
echo =======================================
echo.
echo If brave.exe shows BasePriority 10 (Above Normal),
echo and Orca/opencode2 show BasePriority 10,
echo then the rules ARE working!
echo.
echo If still showing 6 (Below Normal) or 8 (Normal),
echo the config may need more time or a full reboot.
echo.
pause
