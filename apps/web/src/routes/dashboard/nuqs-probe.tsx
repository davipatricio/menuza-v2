import { createFileRoute } from "@tanstack/react-router";
import { useQueryState } from "nuqs";

export const Route = createFileRoute("/dashboard/nuqs-probe")({
  head: () => ({ meta: [{ title: "nuqs probe" }] }),
  component: NuqsProbe,
});

function NuqsProbe() {
  const [tab] = useQueryState("tab");

  return <p>tab:{tab ?? "none"}</p>;
}
