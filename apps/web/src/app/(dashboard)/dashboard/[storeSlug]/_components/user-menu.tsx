"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, Repeat } from "lucide-react";
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

export function UserMenu({ userName }: { userName: string }) {
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Menu da conta de ${userName}`}
        className="flex w-full min-w-0 items-center gap-2 rounded-lg p-2 text-left text-sm transition-colors outline-none group-data-[collapsible=icon]:justify-center hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Avatar size="sm">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate font-medium group-data-[collapsible=icon]:hidden">
          {userName}
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{userName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            nativeButton={false}
            render={<Link href="/dashboard" aria-label="Trocar de loja" />}
          >
            <Repeat aria-hidden="true" />
            Trocar de loja
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <LogOut aria-hidden="true" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
