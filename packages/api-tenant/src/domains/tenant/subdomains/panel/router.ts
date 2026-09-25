import { getStoreImpl } from "./getStore.impl.ts";

export const panelSubdomainRouter = {
  getStore: getStoreImpl,
};

export type PanelSubdomainRouter = typeof panelSubdomainRouter;
