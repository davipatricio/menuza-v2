"use client";

import Link from "next/link";
import { ChevronsUpDown, Repeat } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { initials } from "@/lib/format.ts";

export function UserMenu({ userName, role }: { userName: string; role: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Menu da conta de ${userName}`}
        className="group/user-menu flex w-full min-w-0 items-center gap-2 rounded-lg p-2 text-left text-sm transition-colors outline-none group-data-[collapsible=icon]:justify-center hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Avatar
          size="sm"
          className="transition-transform duration-200 ease-out group-hover/user-menu:scale-105 motion-reduce:transition-none motion-reduce:group-hover/user-menu:scale-100"
        >
          <AvatarFallback>{initials(userName)}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
          <span className="truncate font-medium">{userName}</span>
          <span className="truncate text-xs text-muted-foreground">{role}</span>
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{userName}</span>
            <span>{role}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            nativeButton={false}
            render={<Link href="/dashboard" aria-label="Trocar de loja" />}
          >
            <Repeat aria-hidden="true" />
            Trocar de loja
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
