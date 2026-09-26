import { getStoreImpl } from "./getStore.impl.ts";
import { createStoreImpl } from "./createStore.impl.ts";

export const panelSubdomainRouter = {
  getStore: getStoreImpl,
  createStore: createStoreImpl,
};

export type PanelSubdomainRouter = typeof panelSubdomainRouter;
