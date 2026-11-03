/**
 * Server functions for the member-level settings screens.
 *
 * The account procedures take no `storeSlug`: a management account spans
 * stores. The team read does take one, and is gated on `team:read`, so a member
 * without it still sees the section, as read-only.
 */
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import type { ActiveSession, TeamMember } from "@menuza/shared/tenant";
import { ApiError } from "@/lib/api-error";
import { panelClient } from "@/server/panel-client.ts";

export type SessionsResult =
  | { status: "ok"; sessions: ActiveSession[] }
  | { status: "unauthenticated" };

export const loadSessionsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionsResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    const { sessions } = await client.account.listSessions();

    return { status: "ok", sessions };
  },
);

export type TeamResult =
  | { status: "ok"; members: TeamMember[] }
  | { status: "forbidden" }
  | { status: "unauthenticated" };

export const loadTeamFn = createServerFn({ method: "GET" })
  .validator(v.object({ storeSlug: v.string() }))
  .handler(async ({ data }): Promise<TeamResult> => {
    const client = await panelClient();

    if (!client) return { status: "unauthenticated" };

    try {
      const { members } = await client.panel.listTeamMembers({ storeSlug: data.storeSlug });

      return { status: "ok", members };
    } catch (error) {
      // `team:read` is the only denial that means "read-only section". A dead
      // session, an unknown store or a transport failure must not render as one.
      if (error instanceof ApiError && error.code === "FORBIDDEN") return { status: "forbidden" };

      throw error;
    }
  });
