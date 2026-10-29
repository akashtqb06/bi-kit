'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboardIcon,
    BookOpenIcon,
    DatabaseIcon,
    HardDriveIcon,
    SettingsIcon,
    BarChart3Icon,
    PanelLeftIcon,
    WalletIcon,
} from 'lucide-react';
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarHeader,
    SidebarFooter,
    useSidebar,
} from '@/components/ui/sidebar';

const navItems = [
    {
        label: 'Dashboards',
        href: '/dashboards',
        icon: LayoutDashboardIcon,
    },
    {
        label: 'Workbooks',
        href: '/workbooks',
        icon: BookOpenIcon,
    },
    {
        label: 'Finance',
        href: '/finance',
        icon: WalletIcon,
    },
    {
        label: 'Data Sources',
        href: '/data-sources',
        icon: DatabaseIcon,
    },
    {
        label: 'Data Store',
        href: '/data-store',
        icon: HardDriveIcon,
    },
    {
        label: 'Settings',
        href: '/settings',
        icon: SettingsIcon,
    },
] as const;
import { UserMenu } from '@src/components/auth/user-menu';
import { isAnyFinanceFeatureEnabled } from '@src/lib/finance/flags';

export function AppSidebar() {
    const pathname = usePathname();
    const { toggleSidebar, state } = useSidebar();

    const visibleNavItems = navItems.filter((item) => {
        if (item.href === '/finance') {
            return isAnyFinanceFeatureEnabled();
        }
        return true;
    });

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader className="border-b">
                <div className="flex items-center gap-2 px-2 py-3">
                    <BarChart3Icon className="size-5 text-primary shrink-0" />
                    <span className="font-semibold text-base tracking-tight truncate group-data-[collapsible=icon]:hidden">
                        BI Kit
                    </span>
                </div>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">Navigation</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {visibleNavItems.map((item) => {
                                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                                return (
                                    <SidebarMenuItem key={item.href}>
                                        <SidebarMenuButton
                                            render={<Link href={item.href} />}
                                            isActive={isActive}
                                            tooltip={item.label}
                                        >
                                            <item.icon className="size-4 shrink-0" />
                                            <span>{item.label}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                );
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="border-t p-2">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <UserMenu variant="sidebar" />
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            onClick={toggleSidebar}
                            tooltip={state === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar'}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <PanelLeftIcon className="size-4 shrink-0" />
                            <span>{state === 'collapsed' ? 'Expand' : 'Collapse'}</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}
