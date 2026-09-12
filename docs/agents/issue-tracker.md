# Issue tracker: Linear (via MCP tools)

Issues and specs for this repo live as Linear issues. Use the Linear MCP tools (`tools.linear.*`) for all operations. Do not use `gh` or `glab`.

Workspace: Menuza (`https://linear.app/menuza`)
Team: Menuza

## Conventions

- **Create an issue**: `save_issue` with `team: "Menuza"`, `title`, `description` (Markdown). Add `labels`, `project`, `parentId`, `priority`, `estimate` as needed.
- **Read an issue**: `list_issues` with `query` / filters to find it, then `list_comments` with `issueId` for discussion. Fetch labels/status via `list_issues` fields.
- **List issues**: `list_issues` with `team: "Menuza"` plus `label`, `state`, `assignee`, `project`, `parentId` filters.
- **Comment on an issue**: `save_comment` with `issueId` + `body` (Markdown).
- **Apply / remove labels**: `save_issue` with `id` + `addLabels` / `removeLabels` (see `triage-labels.md` for role strings).
- **Close**: `save_issue` with `id` + completed/canceled `state` (check `list_issue_statuses` for team Menuza). Post explanation first with `save_comment`.

## When a skill says "publish to the issue tracker"

Create a Linear issue in team Menuza.

## When a skill says "fetch the relevant ticket"

`list_issues` to find it, then `list_comments` for full context.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a parent issue with **child** issues as tickets.

- **Map**: a single issue in team Menuza holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: an issue with `parentId` set to the map (sub-issue). Add `Type:` semantics via labels or title prefix (`research`/`prototype`/`grilling`/`task`). Once claimed, assign to driving dev.
- **Blocking**: native `blocks` / `blockedBy` relations on `save_issue`. A ticket is unblocked when every blocker is completed/canceled.
- **Frontier query**: list the map's open children (`list_issues` with `parentId`), drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `save_issue` with `assignee: "me"`, the session's first write.
- **Resolve**: `save_comment` with the answer, then move to completed state, then append a context pointer to the map's Decisions-so-far.
