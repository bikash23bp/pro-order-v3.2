import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/orders")({
  component: OrdersLayout,
});

function OrdersLayout() {
  return <Outlet />;
}
