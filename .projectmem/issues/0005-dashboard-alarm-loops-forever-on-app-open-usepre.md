# #0005 Dashboard alarm loops forever on app open; usePreventRemove 'Descartar' never closes the screen

- 2026-11-15T20:59:43Z `issue`: Dashboard alarm loops forever on app open; usePreventRemove 'Descartar' never closes the screen [apps/mobile-dashboard/src/lib/alert.tsx:44]
- 2026-11-15T20:59:50Z `fix`: Alarm now starts only on a rise in pending count, pauses in background; unsaved-changes guard uses repeat() so Discard actually closes [apps/mobile-dashboard/src/lib/alert.tsx:44]
