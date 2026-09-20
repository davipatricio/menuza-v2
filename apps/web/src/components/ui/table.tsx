import type * as React from "react";
import { cn } from "cn";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      className={cn(
        "border-t bg-neutral-100/50 font-medium dark:bg-neutral-800/50 [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b border-neutral-200 transition-colors hover:bg-neutral-100/50 data-[state=selected]:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800/50 dark:data-[state=selected]:bg-neutral-800",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-10 px-3 text-left align-middle font-medium text-neutral-500 dark:text-neutral-400 [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td className={cn("p-3 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  );
}

export function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      className={cn("mt-4 text-xs text-neutral-500 dark:text-neutral-400", className)}
      {...props}
    />
  );
}
