import { listPanelOrders } from "@menuza/api-client/tenant";
import { useQuery } from "@tanstack/react-query";

/** Every open order of the selected store, shared by the tabs and the alarm. */
export function useOrders(storeSlug: string | null) {
  return useQuery({
    queryKey: ["orders", storeSlug],
    enabled: Boolean(storeSlug),
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelOrders(storeSlug);

      if (response.status !== 200) throw new Error(`Os pedidos responderam ${response.status}.`);

      return response.data.orders;
    },
  });
}
