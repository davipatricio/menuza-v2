# === PROCESS LASSO OPTIMIZATION SUGGESTIONS ===
# Premium features configuration guide
# This generates suggestions, not actual config changes

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  PROCESS LASSO PREMIUM OPTIMIZATION GUIDE" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Process Lasso stores config in registry binary format
# Key: HKLM:\SOFTWARE\Bitsum\ProcessGovernor
# The ProBalance data is stored as binary byte arrays

Write-Host ""
Write-Host "CURRENT CONFIG:" -ForegroundColor Yellow
Write-Host "  ProBalance: ACTIVE (binary data in registry)" -ForegroundColor Green
Write-Host "  LastRestraintBeginTime: present" -ForegroundColor Green
Write-Host "  TotalRestraintTime: present" -ForegroundColor Green
Write-Host "  Registry: HKLM:\SOFTWARE\Bitsum\Counters"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  RECOMMENDED PROCESS LASSO SETTINGS" -ForegroundColor Cyan
Write-Host "  (Apply via GUI: Right-click system tray icon)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "--- [1] PROBALANCE SETTINGS ---" -ForegroundColor Yellow
Write-Host "  Action: Double-click system tray icon to open UI" -ForegroundColor White
Write-Host "  Enable: ProBalance (already active)" -ForegroundColor White
Write-Host "  Settings:" -ForegroundColor White
Write-Host "    - Minimum CPU Usage Threshold: 5%" -ForegroundColor White
Write-Host "    - Polling Interval: 2 seconds" -ForegroundColor White
Write-Host "    - CPU Saturation Threshold: 80%" -ForegroundColor White
Write-Host "    - Maximum number of adjustments per minute: 6" -ForegroundColor White
Write-Host "    - Enable Core Balancing: YES" -ForegroundColor White
Write-Host "    - Exclude System Processes: YES" -ForegroundColor White

Write-Host ""
Write-Host "--- [2] PROCESS RULES (Priority) ---" -ForegroundColor Yellow
Write-Host "  Create rules via: Apps -> Process Rules -> Add" -ForegroundColor White
Write-Host ""
Write-Host "  Rule 1: Brave" -ForegroundColor White
Write-Host "    - Pattern: brave*" -ForegroundColor White
Write-Host "    - Priority Class: Above Normal" -ForegroundColor White
Write-Host "    - Affinity: Auto" -ForegroundColor White
Write-Host "    - Reason: 24 instances need balanced scheduling" -ForegroundColor White
Write-Host ""
Write-Host "  Rule 2: Orca" -ForegroundColor White
Write-Host "    - Pattern: Orca*" -ForegroundColor White
Write-Host "    - Priority Class: Above Normal" -ForegroundColor White
Write-Host "    - Affinity: Auto" -ForegroundColor White
Write-Host "    - Reason: 7 instances, heavy IDE workload" -ForegroundColor White
Write-Host ""
Write-Host "  Rule 3: opencode2" -ForegroundColor White
Write-Host "    - Pattern: opencode2*" -ForegroundColor White
Write-Host "    - Priority Class: Above Normal" -ForegroundColor White
Write-Host "    - Affinity: Auto" -ForegroundColor White
Write-Host "    - Reason: 2 instances, Node.js based" -ForegroundColor White
Write-Host ""
Write-Host "  Rule 4: Explorer" -ForegroundColor White
Write-Host "    - Pattern: explorer*" -ForegroundColor White
Write-Host "    - Priority Class: Normal" -ForegroundColor White
Write-Host "    - Affinity: Auto" -ForegroundColor White
Write-Host "    - Reason: System stability" -ForegroundColor White

Write-Host ""
Write-Host "--- [3] CPU OPTIMIZATION ---" -ForegroundColor Yellow
Write-Host "  Settings -> CPU Optimization:" -ForegroundColor White
Write-Host "    - Enable: TRUE" -ForegroundColor White
Write-Host "    - Idle CPU Priority: Low" -ForegroundColor White
Write-Host "    - Active CPU Priority: Above Normal (user apps)" -ForegroundColor White
Write-Host "    - Set process priorities based on: CPU usage" -ForegroundColor White
Write-Host "    - Minimum CPU for ProBalance: 100ms" -ForegroundColor White
Write-Host "    - Maximum CPU time per adjustment: 50ms" -ForegroundColor White

Write-Host ""
Write-Host "--- [4] CORE BALANCING ---" -ForegroundColor Yellow
Write-Host "  Settings -> Core Balancing:" -ForegroundColor White
Write-Host "    - Enable: TRUE" -ForegroundColor White
Write-Host "    - Balance mode: Even distribution across cores" -ForegroundColor White
Write-Host "    - Exclude cores: 0 (leave core 0 for OS)" -ForegroundColor White
Write-Host "    - Cores to use: 1-11 (11 cores for user workloads)" -ForegroundColor White
Write-Host "    - Rebalance interval: 5 seconds" -ForegroundColor White
Write-Host "    - Note: AMD Ryzen 5500U = 6C/12T" -ForegroundColor White
Write-Host "            Use 12 logical processors, spread evenly" -ForegroundColor White

Write-Host ""
Write-Host "--- [5] POWER MODE ---" -ForegroundColor Yellow
Write-Host "  Settings -> Power Mode:" -ForegroundColor White
Write-Host "    - Mode: Maximum Performance" -ForegroundColor White
Write-Host "    - Disable Core Parking: TRUE" -ForegroundColor White
Write-Host "    - Note: Already set to 'Bitsum Highest Performance'" -ForegroundColor White
Write-Host "            Plan should work with Process Lasso" -ForegroundColor White

Write-Host ""
Write-Host "--- [6] GAME MODE (for when you game) ---" -ForegroundColor Yellow
Write-Host "  Settings -> Game Mode:" -ForegroundColor White
Write-Host "    - Enable: TRUE" -ForegroundColor White
Write-Host "    - Priority: High for game processes" -ForegroundColor White
Write-Host "    - Exclude: Brave, Orca, opencode (not gaming apps)" -ForegroundColor White
Write-Host "    - FPS limiter: None (if not gaming)" -ForegroundColor White
Write-Host "    - VSync: Off" -ForegroundColor White

Write-Host ""
Write-Host "--- [7] ADVANCED SETTINGS ---" -ForegroundColor Yellow
Write-Host "  Settings -> Advanced:" -ForegroundColor White
Write-Host "    - Enable Memory Optimization: YES" -ForegroundColor White
Write-Host "    - Trim working sets of idle processes: YES" -ForegroundColor White
Write-Host "    - Idle trim interval: 30 seconds" -ForegroundColor White
Write-Host "    - Minimum working set trim: 10 MB" -ForegroundColor White
Write-Host "    - Maximum working set trim: 500 MB" -ForegroundColor White
Write-Host "    - Note: With 24 Brave + 7 Orca instances," -ForegroundColor White
Write-Host "            trimming idle tabs frees significant RAM" -ForegroundColor White
Write-Host "    - Auto-start Process Lasso: YES" -ForegroundColor White
Write-Host "    - Minimize to tray: YES" -ForegroundColor White
Write-Host "    - Hide from taskbar: YES" -ForegroundColor White

Write-Host ""
Write-Host "--- [8] EXCLUDED PROCESSES (DON'T TOUCH) ---" -ForegroundColor Yellow
Write-Host "  ProBalance should exclude:" -ForegroundColor White
Write-Host "    - System" -ForegroundColor White
Write-Host "    - svchost*" -ForegroundColor White
Write-Host "    - explorer" -ForegroundColor White
Write-Host "    - csrss*" -ForegroundColor White
Write-Host "    - wininit*" -ForegroundColor White
Write-Host "    - lsass*" -ForegroundColor White
Write-Host "    - dwm" -ForegroundColor White
Write-Host "    - textinputhost*" -ForegroundColor White
Write-Host "    - StartMenuExperienceHost*" -ForegroundColor White

Write-Host ""
Write-Host "--- [9] REGISTRY DIRECT CONFIG (if GUI fails) ---" -ForegroundColor Yellow
Write-Host "  You can try editing HKLM:\SOFTWARE\Bitsum\ProcessGovernor" -ForegroundColor White
Write-Host "  Note: Config is stored as binary data (encrypted)" -ForegroundColor White
Write-Host "  Direct registry edits may corrupt settings!" -ForegroundColor Red
Write-Host "  Use GUI instead." -ForegroundColor White

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Process Lasso settings applied via GUI" -ForegroundColor Cyan
Write-Host "  No config files modified on disk" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
