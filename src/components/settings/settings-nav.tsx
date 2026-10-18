'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    UserRoundIcon,
    ShieldCheckIcon,
    LaptopIcon,
    PaletteIcon,
    UsersIcon,
    KeyRoundIcon,
    Settings2Icon,
} from 'lucide-react';
import { cn } from 'cn';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';

interface NavItem {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
}

const baseNavItems: NavItem[] = [
    { label: 'Profile', href: '/settings/profile', icon: UserRoundIcon },
    { label: 'Security', href: '/settings/security', icon: ShieldCheckIcon },
    { label: 'Sessions', href: '/settings/sessions', icon: LaptopIcon },
    { label: 'Appearance', href: '/settings/appearance', icon: PaletteIcon },
];

const adminNavItems: NavItem[] = [
    { label: 'Users', href: '/settings/users', icon: UsersIcon, adminOnly: true },
    { label: 'Roles & Permissions', href: '/settings/roles', icon: KeyRoundIcon, adminOnly: true },
    { label: 'General', href: '/settings/general', icon: Settings2Icon, adminOnly: true },
];

export function SettingsNav({ isAdmin }: { isAdmin: boolean }) {
    const pathname = usePathname();
    const router = useRouter();

    const visibleItems = isAdmin ? [...baseNavItems, ...adminNavItems] : baseNavItems;

    // Find active item
    const currentActive = visibleItems.find(
        (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
    )?.href ?? '/settings/profile';

    return (
        <aside className="w-full md:w-56 shrink-0">
            {/* Small screen: horizontal Tabs row */}
            <div className="block md:hidden pb-4">
                <Tabs value={currentActive} onValueChange={(val) => router.push(val)}>
                    <TabsList className="w-full flex justify-start overflow-x-auto no-scrollbar py-1">
                        {visibleItems.map((item) => (
                            <TabsTrigger
                                key={item.href}
                                value={item.href}
                                className="gap-2 shrink-0 text-xs sm:text-sm"
                            >
                                <item.icon className="size-4" />
                                <span>{item.label}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            {/* Medium/large screen: vertical navigation list */}
            <div className="hidden md:flex flex-col gap-1">
                <nav className="flex flex-col gap-1" aria-label="Settings navigation">
                    {baseNavItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    'flex items-center gap-2.5 px-3 py-2 text-sm rounded-md font-medium transition-colors',
                                    isActive
                                        ? 'bg-muted text-foreground font-semibold shadow-xs'
                                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                )}
                            >
                                <item.icon className={cn('size-4 shrink-0', isActive ? 'text-foreground' : 'text-muted-foreground')} />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}

                    {isAdmin && (
                        <>
                            <div className="pt-4 pb-1 px-3">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Administration
                                </p>
                            </div>
                            <Separator className="my-1" />
                            {adminNavItems.map((item) => {
                                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            'flex items-center gap-2.5 px-3 py-2 text-sm rounded-md font-medium transition-colors',
                                            isActive
                                                ? 'bg-muted text-foreground font-semibold shadow-xs'
                                                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                        )}
                                    >
                                        <item.icon className={cn('size-4 shrink-0', isActive ? 'text-foreground' : 'text-muted-foreground')} />
                                        <span>{item.label}</span>
                                    </Link>
                                );
                            })}
                        </>
                    )}
                </nav>
            </div>
        </aside>
    );
}
