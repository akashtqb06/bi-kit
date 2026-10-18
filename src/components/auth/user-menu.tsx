'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
    ChevronsUpDownIcon,
    LaptopIcon,
    LogOutIcon,
    MoonIcon,
    SunIcon,
    UserRoundIcon,
    SettingsIcon,
    HouseIcon,
} from 'lucide-react';
import { logoutAction } from '@src/lib/auth/actions';
import { useCurrentUser } from './user-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { cn } from 'cn';
import { getAvatarColor } from '@src/components/settings/profile-form';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function initials(name: string): string {
    return (
        name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? '')
            .join('') || 'U'
    );
}

export function UserMenu({
    variant = 'sidebar',
    backToHome = false,
}: {
    variant?: 'sidebar' | 'compact';
    backToHome?: boolean;
}) {
    const user = useCurrentUser();
    const { setTheme, theme } = useTheme();
    if (!user) return null;

    const avatar = (
        <Avatar className="size-8">
            <AvatarImage src={user.avatarUrl ?? undefined} alt="" />
            <AvatarFallback className={cn('text-xs font-medium', getAvatarColor(user.id))}>{initials(user.name)}</AvatarFallback>
        </Avatar>
    );

    const trigger =
        variant === 'sidebar' ? (
            <DropdownMenuTrigger
                render={
                    <SidebarMenuButton size="lg" className="h-12 w-full justify-start gap-2">
                        {avatar}
                        <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                            <span className="truncate text-sm font-medium">{user.name}</span>
                            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                        </span>
                        <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                    </SidebarMenuButton>
                }
            />
        ) : (
            <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label="User menu" />}
            >
                {avatar}
            </DropdownMenuTrigger>
        );

    return (
        <DropdownMenu>
            {trigger}
            <DropdownMenuContent align={variant === 'sidebar' ? 'start' : 'end'} side="top" className="w-60">
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="font-normal">
                        <span className="block truncate text-sm font-medium">{user.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                    </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem nativeButton={false} render={<Link href="/settings/profile" />}>
                    <UserRoundIcon />
                    Profile
                </DropdownMenuItem>
                <DropdownMenuItem nativeButton={false} render={<Link href="/settings" />}>
                    <SettingsIcon />
                    Settings
                </DropdownMenuItem>
                {backToHome && (
                    <DropdownMenuItem nativeButton={false} render={<Link href="/" />}>
                        <HouseIcon />
                        Back to home
                    </DropdownMenuItem>
                )}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <SunIcon />
                        Theme
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => setTheme('light')}>
                            <SunIcon />
                            Light
                            {theme === 'light' && <span className="ml-auto text-xs">Current</span>}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme('dark')}>
                            <MoonIcon />
                            Dark
                            {theme === 'dark' && <span className="ml-auto text-xs">Current</span>}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme('system')}>
                            <LaptopIcon />
                            System
                            {theme === 'system' && <span className="ml-auto text-xs">Current</span>}
                        </DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void logoutAction()}>
                    <LogOutIcon />
                    Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
