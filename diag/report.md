# 🔍 Windows System Diagnostic Report

**Host:** `DAVI-PC` | **Generated:** 2026-09-07 | **User:** No UAC enabled

---

## 📋 Hardware Summary

| Component     | Detail                                 |
| ------------- | -------------------------------------- |
| **System**    | Lenovo 82MF                            |
| **BIOS**      | LENOVO GLCN63WW (2024-06-16)           |
| **CPU**       | AMD Ryzen 5 5500U (6C / 12T, Zen 3)    |
| **RAM**       | ~18.8 GB total (16GB + 4GB, DDR4-3200) |
| **Storage 1** | NVMe IM2P33F4 256GB SSD (C:)           |
| **Storage 2** | TOSHIBA MQ01ABF050 500GB HDD (D:)      |
| **GPU**       | AMD Radeon™ Graphics (integrated)      |
| **Network**   | Realtek 8822CE Wi-Fi (AC)              |

---

## 🚨 CRITICAL ISSUES FOUND

### 1. 🔴 Windows Defender Completely Disabled

- Antivirus: **OFF**
- Real-time Protection: **OFF**
- Behavior Monitor: **OFF**
- Antispyware: **OFF**
- IoAV Protection: **OFF**
- Signatures: **EMPTY** (never updated)

**Risk:** Your system has **zero malware protection**. This is a severe security exposure, especially since there's no UAC either. Any malware that executes runs with full system privileges.

### 2. 🔴 CPU Not Boosting (Running at Base Clock)

- **MaxClockSpeed:** 2100 MHz (base)
- **CurrentClockSpeed:** 2100 MHz
- **Load:** 80%

The Ryzen 5 5500U should boost up to **4.0 GHz** under load. It's stuck at its 2.1 GHz base clock even at 80% load.

**Possible causes:**

- AMD Software 26.5.2 driver may be overriding Windows power management
- Ryzen Master SDK installed could be interfering
- Power plan (Bitsum Highest Performance) set to 5% minimum on DC
- Thermal throttling (needs temperature readings)
- Hyper-V TSC sync errors logged in Event Viewer

### 3. 🟡 Low Disk Space on C: (NVMe)

- **C: (NVMe):** 86.2 GB free / 237.5 GB used = **63% full**
- **D: (HDD):** 301.3 GB free / 465.8 GB used = **35% full** ✅

The NVMe is the boot drive and is getting tight. Windows needs at least 15-20% free for optimal performance and swap/file operations.

### 4. 🟡 High RAM Usage

- **Free RAM:** 3.7 GB / 18.8 GB total (**80% used**)
- **Top consumers:** Orca (4 instances), Brave (7 instances), opencode (2 instances), Spotify

### 5. 🟡 Excessive Browser Instances

- **7 Brave browser instances** running simultaneously
- **4 Orca instances**
- **2 opencode instances**
- Combined consuming **~2.8 GB RAM** just on browsers

---

## ⚙️ System Configuration

### Power Plan

- **Active:** `Bitsum Highest Performance` (Process Lasso)
- **Min Processor State:** 100% (AC), **5% (DC/On Battery)** ⚠
- **Max Processor State:** 100%

The 5% minimum on battery is extremely aggressive power saving. If you ever work unplugged, the CPU will be severely throttled.

### Storage Details

| Drive | Type | Interface | Free     | Used | Status |
| ----- | ---- | --------- | -------- | ---- | ------ |
| C:    | SSD  | NVMe/SCSI | 86.2 GB  | ~63% | ✅ OK  |
| D:    | HDD  | IDE       | 301.3 GB | ~35% | ✅ OK  |

**Note:** The 500GB HDD is connected via **IDE** interface (not SATA/NVMe). This is significantly slower than a modern SATA III drive.

### GPU

- **AMD Radeon™ Graphics** (integrated)
- **Driver:** 31.0.21925.1001 (dated 2026-05-19)
- **VRAM:** 1 GB shared
- **Resolution:** 1024×768 (reported) — **might not be the actual desktop resolution**
- **Status:** OK

### Network

- **Wi-Fi:** Realtek 8822CE, IP 192.168.0.5, MAC 24:FE:9A:07:59:8D
- **Speed:** 390 Mbps (link speed)
- **Bluetooth:** Present

### Installed Applications

| Category      | Apps                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **AMD**       | AMD Software 26.5.2, Settings, Chipset, Drivers (GPIO, I2C, PSP, SMBus, Balanced), WVR64, DVR64, Branding, RyzenMasterSDK |
| **Browsers**  | Brave (multiple), Microsoft Edge 152.0.4191.66                                                                            |
| **Dev Tools** | Node.js 26.4.0, Git 2.55.0.2, GitHub CLI 2.96.0                                                                           |
| **Media**     | VLC 3.0.23, Spotify, ImageGlass                                                                                           |
| **Utilities** | 7-Zip 26.02, WinDirStat 2.7.0, Process Lasso 18.2.2.10                                                                    |
| **System**    | WSL 2.9.3.0, Steam 2.10.91.91, Podman Desktop                                                                             |
| **Other**     | Visual C++ 2019/2022 Runtimes, Aplicativo Itaú                                                                            |

### Autostart Items

- BraveSoftware Update
- Podman Desktop
- SecurityHealth (Defender tray)
- RtkAudUService (Realtek audio)

### Running Services (selected)

- WinDefend: **Running** (but Defender is disabled) — conflicting state
- AMD Crash Defender: Running
- AMD External Events Utility: Running
- LenovoFnAndFunctionKeys: Running
- ProcessGovernor (Process Lasso): Running
- ElevocService: Running (unknown)
- Docker Desktop Service: **Crashed** (Event ID 7034)

---

## 🐛 Event Log Errors

| Date | ID   | Source  | Issue                                                                   |
| ---- | ---- | ------- | ----------------------------------------------------------------------- |
| 9/6  | 36   | Volsnap | Shadow copy storage limit reached on C:                                 |
| 9/6  | 7034 | SCM     | Docker Desktop Service crashed                                          |
| 9/1  | 154  | Hyper-V | **TSC synchronization failure** across logical processors (delta: 1211) |
| 9/5  | 7034 | SCM     | Diagnostic Policy Service crashed                                       |
| 9/5  | 36   | Volsnap | Shadow copy storage limit reached                                       |
| 8/31 | 7000 | SCM     | l1vhlwf service failed to start                                         |
| 8/31 | 1    | CLFS    | Authentication error, missing log files                                 |

**Key concern:** Hyper-V TSC sync errors are logged. This is likely why the CPU clock is abnormal. Hyper-V might be enabled or WSL2 is using the Hyper-V hypervisor.

---

## 📊 Resource Usage Breakdown

### Top RAM Consumers (Current)

| Process   | RAM (MB) | Count       |
| --------- | -------- | ----------- |
| Orca      | ~427     | 4 instances |
| Brave     | ~348     | 7 instances |
| opencode2 | ~442     | 2 instances |
| explorer  | 280      | 1           |
| Spotify   | 130      | 1           |
| vmmemwslc | 131      | 1 (WSL2 VM) |

### Estimated Total Browser RAM

7 Brave instances × ~200 MB = **~1.4 GB** just on Brave

---

## 🏋️ HPET Status

HPET (High Precision Event Timer) could not be queried via standard WMI classes (`Win32_DeviceInterface`, `Win32_Timer` are unavailable). HPET typically appears as a device in ACPI and can be checked via:

- Registry: `HKLM\SYSTEM\CurrentControlSet\Control\Hardware Profiles\Current\System\MultiFunctionSerialBus\0\HPET`
- Device Manager: System devices → High Precision Event Timer

**Recommendation:** Check Device Manager manually. HPET is usually enabled by default on modern systems. Disabling it can cause audio/video sync issues and timing problems.

---

## ✅ IMPROVEMENTS RECOMMENDED (Do Not Apply)

### 🔴 Priority 1: Security

1. **Enable Windows Defender immediately** — Run:

   ```powershell
   Set-MpPreference -DisableRealtimeMonitoring $false
   Set-MpPreference -DisableBehaviorMonitoring $false
   ```

   Or via Settings → Privacy & Security → Windows Security → Virus & threat protection → Turn on

2. **Enable UAC** — No UAC means zero privilege escalation barrier

3. **Update Defender signatures** — They're completely empty

### 🟡 Priority 2: Performance

4. **Fix CPU boosting** — Investigate AMD Software power management:
   - Open AMD Software → Gaming → disable "Radeon Anti-Lag" and power management override
   - Or switch power plan to "Balanced" and check if CPU boosts
   - Check AMD Power Plans: `powercfg -attributes SUB_PROCESSOR PROCTHROTTLEMAX 54533251-82be-4824-96c1-47b60d740d00 /ATTRIB_HIDE`

5. **Reduce browser instances** — 7 Brave tabs are a RAM hog. Consider using tab groups or a single window.

6. **Free up C: drive space** — At 63%, it's getting tight:
   - Run Disk Cleanup: `cleanmgr /d C:`
   - Move user data to D: drive
   - Clear WinDirStat-identified large files

7. **Check shadow copy storage** — Volsnap errors suggest VSS is hitting limits. Increase shadow storage or reduce system-protected files.

### 🟢 Priority 3: Maintenance

8. **Update GPU driver** — AMD Radeon driver 31.0.21925.1001 from May 2026 may be outdated. Check AMD Software for updates.

9. **Check HDD health** — 500GB IDE drive is old. Consider replacing with a SATA SSD if storing important data.

10. **Investigate Hyper-V** — TSC sync errors suggest Hyper-V is interfering. If not needed:

    ```powershell
    Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V
    ```

11. **Fix Docker Desktop** — Crashed repeatedly. Consider Podman (already installed) as alternative.

12. **Review autostart** — Podman Desktop, Brave Update, ElevocService may not need to auto-start.

13. **Power plan for battery** — Change DC min processor from 5% to at least 20-30% if you use laptop on battery.

---

## 🛠️ Helper Scripts Generated

I've created diagnostic scripts in `C:\Users\davip\Documents\Projetos\menuza\diag\`:

| Script        | Purpose                                     |
| ------------- | ------------------------------------------- |
| `collect.ps1` | Full diagnostic dump (all subsystems)       |
| `quick.ps1`   | Quick health check (one-liner overview)     |
| `thermal.ps1` | Thermal, power, CPU boost, and HPET details |

### Usage

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\davip\Documents\Projetos\menuza\diag\quick.ps1
powershell -ExecutionPolicy Bypass -File C:\Users\davip\Documents\Projetos\menuza\diag\collect.ps1
powershell -ExecutionPolicy Bypass -File C:\Users\davip\Documents\Projetos\menuza\diag\thermal.ps1
```

### Quick Health Check Command

```powershell
powershell -ExecutionPolicy Bypass -Command "(Get-CimInstance Win32_Processor).CurrentClockSpeed + 'MHz CPU clock, ' + [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB,1) + 'GB RAM, ' + [math]::Round((Get-CimInstance Win32_LogicalDrive | Where-Object DeviceID -eq 'C:').FreeSpace/1GB,1) + 'GB C: free'"
```

---

## 📝 Summary Scorecard

| Category      | Status                               | Score         |
| ------------- | ------------------------------------ | ------------- |
| **Security**  | Defender OFF, No UAC                 | 🔴 1/10       |
| **CPU**       | Not boosting, thermal/Hyper-V issues | 🟡 5/10       |
| **RAM**       | 80% utilized, many instances         | 🟡 6/10       |
| **Storage**   | C: tight, D: OK                      | 🟡 6/10       |
| **GPU**       | OK, driver current                   | 🟢 7/10       |
| **Network**   | Wi-Fi working, Realtek               | 🟢 8/10       |
| **Drivers**   | AMD suite installed, mixed           | 🟡 6/10       |
| **Stability** | Service crashes, VSS issues          | 🟡 5/10       |
| **HPET**      | Could not verify                     | ❓ ?/10       |
| **Overall**   |                                      | 🟡 **5.4/10** |
