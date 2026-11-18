# #0002 Login/signup forms lose input on first submit: native form POST before React hydration wipes the fields

- 2026-11-08T03:03:04Z `issue`: Login/signup forms lose input on first submit: native form POST before React hydration wipes the fields [apps/web/src/features/auth/components/login-form.tsx]
- 2026-11-08T03:03:09Z `fix`: Root head script cancels native submit (React handlers unaffected); use-autofill-sync replays pre-hydration DOM values into form state on mount [apps/web/src/routes/__root.tsx, apps/web/src/hooks/use-autofill-sync.ts]
