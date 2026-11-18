import { OrdersBoard } from "@/components/orders-board.tsx";

/**
 * The Pedidos tab. It lives at `pedidos.tsx`, not `index.tsx`: `app/index.tsx`
 * is the session gate at `/`, and two routes claiming `/` is what made the
 * router bounce between the login gate and the tab group on boot.
 */
export default function OrdersRoute() {
  return <OrdersBoard />;
}
