# Follow-ups

Open work that is not a feature decision. **Linear is the only ticket store** — this file keeps no ticket list and no status, so nothing here goes stale. Query team `Menuza` for what is open (querying rules: `../tickets/README.md`).

## Product gates

The high-priority decisions in `../product/open-decisions.md` block detailed design of billing, gateways, wallet, stock reservation, scheduling, the order state machine, privacy and permissions. Surface the gap; do not invent an answer.

## Technical pendencies (`PRODUCT.md` §27)

- Validate Prisma on the Bun runtime in production; decide the Postgres adapter and its connection impact.
- Define the oRPC contract format (procedures vs streamable) and route-versioning strategy.
- Implement the `Mailer` interface with an SMTP driver and a SES stub.
- Migration lock for production (Prisma Migrate + advisory lock).
- Log, trace and audit retention/disposal policy (LGPD).
- Disaster recovery for a single VPS: snapshots plus a tested restore.
- VPS monitoring (CPU, RAM, disk, BullMQ) with basic alerts.

## Where the work stands

Ticket status, priority, estimates, epic membership and what comes next live in Linear only — fetch team `Menuza` once (`list_issues`, limit 250) and filter in code, then read the description and `list_comments` of each candidate, because ordering and blockers are written in the prose, not in the relations. What the code already does is documented per area under `../features/` and in `stack.md` / `../tickets/README.md`.
