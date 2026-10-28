import type { ReactNode } from "react";
import { ToolRegistryProvider } from "@/lib/tools/registry.ts";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <ToolRegistryProvider>{children}</ToolRegistryProvider>;
}
