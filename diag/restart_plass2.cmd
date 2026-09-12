@echo off
echo ========================================
echo   RESTARTING PROCESS LASSO
echo   Correct paths: C:\Program Files\Process Lasso\
echo ========================================
echo.

REM Kill existing instances via taskkill
echo Killing existing processes...
taskkill /f /im ProcessGovernor.exe >nul 2>&1
taskkill /f /im ProcessLasso.exe >nul 2>&1
taskkill /f /im srvstub.exe >nul 2>&1
echo [OK] All instances killed.

REM Restart via service
echo.
echo Restarting ProcessGovernor service...
net stop ProcessGovernor >nul 2>&1
net start ProcessGovernor >nul 2>&1
echo [OK] ProcessGovernor service restarted.

REM Wait for service to initialize
timeout /t 3 /nobreak >nul

REM Restart ProcessLasso GUI with new config
echo.
echo Starting ProcessLasso GUI...
start "" /min "C:\Program Files\Process Lasso\ProcessLasso.exe" /ShowWindow /ConfigFolder="C:\Users\davip\AppData\Roaming\Bitsum\Process Lasso" /TrimNow
echo [OK] ProcessLasso GUI started.

REM Wait for config to load
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo   RESTART COMPLETE
echo ========================================
echo.
echo Now verifying rules...
echo.

REM Verify prolasso.ini content
echo --- Checking prolasso.ini rules ---
echo.
echo DefaultPriorities line:
type "C:\Users\davip\AppData\Roaming\Bitsum\Process Lasso\prolasso.ini" | find "DefaultPriorities"
echo.
echo DefaultAffinities line:
type "C:\Users\davip\AppData\Roaming\Bitsum\Process Lasso\prolasso.ini" | find "DefaultAffinities"
echo.
echo OOC Restraint settings:
type "C:\Users\davip\AppData\Roaming\Bitsum\Process Lasso\prolasso.ini" | find "OocOn"
type "C:\Users\davip\AppData\Roaming\Bitsum\Process Lasso\prolasso.ini" | find "TotalProcessorUsageBeforeRestraint"
echo.
echo Boost settings:
type "C:\Users\davip\AppData\Roaming\Bitsum\Process Lasso\prolasso.ini" | find "BoostForegroundProcess"
type "C:\Users\davip\AppData\Roaming\Bitsum\Process Lasso\prolasso.ini" | find "TrimAllProcessesAtThisIntervalInMs"
echo.
echo ========================================
echo   MANUAL VERIFICATION NEEDED
echo ========================================
echo.
echo Open Process Lasso GUI and verify:
echo   1. Main tab -> Manage Processes of All Users (if checked)
echo   2. Brave.exe shows priority "Above Normal"
echo   3. Orca.exe shows priority "Above Normal"
echo   4. opencode2.exe shows priority "Above Normal"
echo   5. CPU affinity shows all cores for these apps
echo   6. ProBalance is active (green indicator)
echo.
echo Or use: ProcessLasso.exe /ShowWindow
echo.
pause
