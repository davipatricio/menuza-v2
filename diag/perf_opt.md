# ⚡ Performance Optimization Report — DAVI-PC

**Hardware:** AMD Ryzen 5 5500U | 18.8 GB DDR4-3200 | NVMe 256GB + IDE HDD 500GB
**OS:** Windows 11 | Power Plan: Bitsum Highest Performance | Hypervisor: Present (WSL2)

---

## 📊 Baseline Measurements

| Metric                | Value                           | Notes                                    |
| --------------------- | ------------------------------- | ---------------------------------------- |
| **CPU Load**          | ~12% average                    | 2100 MHz base (WMI may not report turbo) |
| **RAM Committed**     | 67.5% (19.3 GB / 28.6 GB)       | Page file being used                     |
| **Free RAM**          | ~3.7 GB / 18.8 GB               | 80% utilized                             |
| **Page File**         | 9995 MB on C:, peak 334 MB used | Small for 18.8 GB RAM                    |
| **WSL2 Processes**    | **25 processes**                | Biggest overhead                         |
| **Browser Instances** | 24 Brave + 7 Orca               | Intentional per user                     |
| **Disk Queue Length** | ~1 (idle)                       | No I/O bottleneck currently              |
| **Hyper-V**           | Present                         | TSC sync errors logged                   |

---

## 🏆 TOP PERFORMANCE OPTIMIZATIONS (Ranked by Impact)

### 🔴 #1 — WSL2 Overhead Reduction ⭐ BIGGEST IMPACT

**Problem:** 25 WSL-related processes running:

- `vmmemWSL` — WSL2 VM overhead (hypervisor)
- `vmmemwslc-cli-davip` — WSL2 CLI bridge
- `wsl` × 10 instances
- `wslhost` × 12 instances (~10 MB each)
- `wslcsession`, `wslrelay`, `wslservice`

**WSL2 always runs a full VM** — this is the biggest CPU/RAM overhead source on your system besides browsers.

**Options:**

| Option                          | Impact  | How                                            |
| ------------------------------- | ------- | ---------------------------------------------- |
| A. WSL1 for lightweight tasks   | High    | `wsl --set-default-version 1` (per distro)     |
| B. Terminate unused WSL distros | Medium  | `wsl --shutdown` then `wsl --terminate Debian` |
| C. Use Podman instead of Docker | Medium  | You already have Podman Desktop                |
| D. Set WSL2 memory limit        | Medium  | Add to `.wslconfig`: `memory=2GB`              |
| E. Full WSL2 shutdown           | Highest | `wsl --shutdown` (kill all, ~8 GB freed)       |

**.wslconfig file** (create at `C:\Users\davip\.wslconfig`):

```ini
[wsl2]
memory=4GB
processors=4
swap=0
localhostForwarding=true
```

This caps WSL2 to 4 GB RAM and 4 CPUs, freeing resources for your apps.

### 🔴 #2 — Page File Optimization

**Problem:** 9995 MB page file on C: (NVMe), 67.5% committed bytes in use. With 18.8 GB RAM and 67% commitment, the page file is small but actively used.

**Recommendation:**

- Increase page file to 16384 MB (16 GB) — set it and forget it
- Move to D: drive (HDD) for overflow to preserve NVMe lifespan
- OR keep on C: but expand to 16 GB

**Command:**

```powershell
# Set page file: 4096 MB initial, 16384 MB max on C:
wmic pagefileset where name="C:\\pagefile.sys" set InitialSize=4096,MaximumSize=16384
```

### 🟡 #3 — Power Plan Fine-Tuning

**Current:** "Bitsum Highest Performance" (Process Lasso)

- Min processor state AC: 100% (good for performance)
- Min processor state DC: **5%** (extreme power saving on battery)
- Hyper-V TSC sync errors suggest the power plan may conflict with virtualization

**Recommendation:**

- Switch AC min processor state to **5%** (allow CPU to idle deeper between bursts) → saves power, reduces heat
- OR set min to **100%** if you want maximum responsiveness
- Enable **CP control** (Critical Power Control) to allow AMD processors to boost properly

**Check if AMD power management is active:**

```powershell
# AMD power plans may override Windows
powercfg -attributes SUB_PROCESSOR PROCTHROTTLEMAX 54533251-82be-4824-96c1-47b60b740d00 /ATTRIB_HIDE
```

**AMD-specific:** Open AMD Software → Gaming → Power:

- Set to "AMD Optimized" or "Maximum Performance"
- Disable "Radeon Chill" if not gaming

### 🟡 #4 — SysMain (SuperFetch) Optimization

**Problem:** SysMain is running automatically. On systems with 18.8 GB RAM and NVMe, SysMain's prefetching competes for I/O and provides minimal benefit (NVMe already handles this).

**Recommendation:** Disable SysMain

```powershell
Stop-Service SysMain -Force
Set-Service SysMain -StartupType Disabled
```

### 🟡 #5 — WSearch Indexing

**Problem:** Windows Search service is running and indexing files — uses CPU and disk I/O.

**Recommendation:** If you don't use Start menu search heavily, disable:

```powershell
Stop-Service WSearch -Force
Set-Service WSearch -StartupType Manual
```

### 🟡 #6 — Unnecessary Auto-Startup Services

| Service           | Action          | Reason                        |
| ----------------- | --------------- | ----------------------------- |
| Spooler           | Keep            | Needed for printing           |
| SysMain           | **Disable**     | NVMe makes SuperFetch useless |
| WSearch           | **Disable**     | Uses CPU/disk I/O             |
| DusmSvc           | Keep            | System usage data             |
| PhoneSvc          | Keep            | If using phone linking        |
| LanmanWorkstation | Keep            | Network share support         |
| TrkWks            | Keep            | Link tracking                 |
| ElevocService     | **Investigate** | Unknown service               |

### 🟡 #7 — Process Lasso Configuration

**Problem:** Process Lasso 18.2.2.10 is installed but its registry settings weren't found. It may not be configured for performance.

**Recommendation:** Check Process Lasso settings:

- Open Process Lasso GUI
- Enable "CPU Optimization" and "ProBalance"
- Set Brave and Orca to "Performance Mode"
- Check if it's managing the "Bitsum Highest Performance" plan

### 🟢 #8 — Network Adapter Offload

**Problem:** Realtek 8822CE may have offload settings that add CPU overhead.

**Recommendation:** Check and disable unnecessary offloads:

```powershell
Get-NetAdapterAdvancedProperty -Name "Wi-Fi" | Where-Object {$_.RegistryKeyword -like '*Offload*'} | Format-Table Name, RegistryKeyword, RegistryValue
```

- Disable **RX/TX Checksum Offload** if stable connection (saves CPU cycles)
- Disable **Large Send Offload (LSO)** if experiencing packet loss

### 🟢 #9 — Memory Compression

**Problem:** Could not verify if memory compression is enabled. On Windows 11 with 18.8 GB RAM, memory compression is generally beneficial (it compresses RAM pages instead of paging to disk).

**Recommendation:** Keep enabled (default on Win11). Check:

```powershell
Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management' | Select-Object MemoryCompression
```

### 🟢 #10 — Hyper-V / WSL2 TSC Sync Fix

**Problem:** Event ID 154 logged — "Hypervisor failed to properly synchronize TSC across logical processors." This causes CPU performance degradation.

**Recommendation:** If WSL2 is essential, add to `.wslconfig`:

```ini
[wsl2]
kernelCommandLine = "tsc=reliable"
```

---

## 📋 QUICK WINS (One-Liner Commands)

```powershell
# 1. Configure WSL2 memory limit
New-Item -Path "$env:USERPROFILE\.wslconfig" -ItemType File -Force -ErrorAction SilentlyContinue
Set-Content -Path "$env:USERPROFILE\.wslconfig" -Value "[wsl2]`nmemory=4GB`nprocessors=4`nswap=0"

# 2. Disable SysMain
Stop-Service SysMain -Force; Set-Service SysMain -StartupType Disabled

# 3. Disable WSearch
Stop-Service WSearch -Force; Set-Service WSearch -StartupType Manual

# 4. Expand page file to 16GB
wmic pagefileset where name="C:\\pagefile.sys" set InitialSize=4096,MaximumSize=16384

# 5. Restart WSL2 (frees ~8GB)
wsl --shutdown

# 6. Check WSL config after restart
wsl --list --verbose
```

---

## 📊 Projected Impact

| Optimization            | RAM Saved   | CPU Saved   | Storage Saved    | Overall            |
| ----------------------- | ----------- | ----------- | ---------------- | ------------------ |
| WSL2 memory cap         | ~4 GB       | ~5-10%      | —                | 🔴 High            |
| WSL2 shutdown when idle | ~8 GB       | ~10-15%     | —                | 🔴 High            |
| Page file increase      | —           | —           | Reduced NV wear  | 🟡 Medium          |
| Disable SysMain         | —           | ~1-2%       | ~50 IOPS         | 🟢 Low             |
| Disable WSearch         | —           | ~1-3%       | ~100 IOPS        | 🟢 Low             |
| Power plan fine-tune    | —           | ~5-10%      | —                | 🟡 Medium          |
| Memory compression ON   | ~2 GB swap  | ~5%         | —                | 🟢 Low             |
| **Combined**            | **~4-8 GB** | **~15-30%** | **NV preserved** | **🔴 Significant** |

---

## ⚠️ Things NOT to Change

| Item                 | Why                                    |
| -------------------- | -------------------------------------- |
| Brave/Orca instances | Intentional per user                   |
| GPU driver           | Already optimized                      |
| Defender             | User choice                            |
| UAC                  | Already at "Never notify"              |
| Boot at end of day   | Fine                                   |
| IDE HDD              | Hardware limitation, replace if needed |
| Browser cache        | Browser-managed, not system            |

---

## 🛠️ Performance Optimization Script

`C:\Users\davip\Documents\Projetos\menuza\diag\perf_opt.ps1` contains all the recommended commands (commented out) for review before applying.
