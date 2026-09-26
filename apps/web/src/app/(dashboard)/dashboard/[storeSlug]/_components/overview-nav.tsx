import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface QuickAction {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Sidebar of shortcuts on the overview. Server-rendered: it is plain links. */
export function OverviewNav({ basePath, actions }: { basePath: string; actions: QuickAction[] }) {
  return (
    <nav aria-label="Ações rápidas" className="flex flex-col gap-3">
      <p className="text-sm font-medium">Ações rápidas</p>
      <ul className="flex flex-col gap-2">
        {actions.map((action) => (
          <li key={action.href}>
            <Link
              href={`${basePath}/${action.href}`}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <action.icon aria-hidden="true" className="size-4 shrink-0" />
              {action.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
