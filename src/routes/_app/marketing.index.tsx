import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/marketing/")({
  beforeLoad: () => {
    throw redirect({ to: "/marketing/whatsapp" });
  },
});
