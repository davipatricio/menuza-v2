import { implement, ORPCError } from "@orpc/server";
import { tenantContractObject } from "@menuza/shared/tenant";
import { sharedErrorCodes } from "@menuza/shared/errors";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";

const os = implement(tenantContractObject.push.getPublicKey);

export const getPublicKeyImpl = os.use(tenantMiddleware({ require: "optional" })).handler(() => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    throw new ORPCError("INTERNAL", {
      message: sharedErrorCodes.INTERNAL.message,
      data: { code: "INTERNAL" },
    });
  }

  return { publicKey };
});

export type GetPublicKeyImpl = typeof getPublicKeyImpl;
