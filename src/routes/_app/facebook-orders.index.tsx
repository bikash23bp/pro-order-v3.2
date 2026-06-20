import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/facebook-orders/")({
  beforeLoad: () => {
    throw redirect({ to: "/facebook-orders/orders" });
  },
});
