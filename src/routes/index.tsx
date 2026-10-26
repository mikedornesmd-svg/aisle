import { createFileRoute } from "@tanstack/react-router";
import { AisleApp } from "@/components/aisle-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <AisleApp />;
}
