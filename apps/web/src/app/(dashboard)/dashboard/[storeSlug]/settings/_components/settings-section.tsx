import type { ReactNode } from "react";

/**
 * Shared settings page shell: title + description + content.
 * Keeps the five settings pages reading as one product.
 */
export function SettingsSection({
  headingId,
  title,
  description,
  children,
}: {
  headingId: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">{description}</p>
      </div>

      {children}
    </section>
  );
}
