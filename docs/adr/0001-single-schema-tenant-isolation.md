# Single-schema tenant isolation enforced in the application

All business tables share one Postgres schema with no row-level security; every tenant-scoped query filters by tenant, checked in the oRPC application layer, because per-schema or RLS approaches add operational cost without matching the team's single-database VPS posture.
