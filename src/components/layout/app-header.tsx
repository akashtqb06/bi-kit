"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useBreadcrumbStore } from "./breadcrumb-store";
import { ThemeToggle } from "./theme-toggle";
import { KeyboardShortcutsDialog } from "./keyboard-shortcuts-dialog";
import { QuickAddSlot } from "@src/components/finance/quick-add/quick-add-slot";

function pathToBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((seg, idx) => {
    const href = "/" + segments.slice(0, idx + 1).join("/");
    const label = seg
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return { href, label, isLast: idx === segments.length - 1 };
  });
}

export function AppHeader() {
  const pathname = usePathname();
  const customCrumbs = useBreadcrumbStore((s) => s.crumbs);

  // Standalone dashboard viewer (/dashboards/[did]) renders its own dedicated slim header
  if (pathname.match(/^\/dashboards\/[^/]+$/)) {
    return null;
  }

  const fallbackCrumbs = pathToBreadcrumbs(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 bg-background">
      <div className="flex items-center gap-2 min-w-0">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />

        <Breadcrumb>
          <BreadcrumbList>
            {customCrumbs && customCrumbs.length > 0 ? (
              customCrumbs.map((crumb, idx) => {
                const isLast = idx === customCrumbs.length - 1;
                return isLast ? (
                  <BreadcrumbItem key={idx}>
                    <BreadcrumbPage className="font-medium text-foreground truncate max-w-[200px] sm:max-w-[320px]">
                      {crumb.label}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                ) : (
                  <React.Fragment key={idx}>
                    <BreadcrumbItem>
                      {crumb.href ? (
                        <BreadcrumbLink
                          render={<Link href={crumb.href} />}
                          className="truncate max-w-[150px]"
                        >
                          {crumb.label}
                        </BreadcrumbLink>
                      ) : (
                        <span className="truncate max-w-[150px]">{crumb.label}</span>
                      )}
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </React.Fragment>
                );
              })
            ) : (
              fallbackCrumbs.map((crumb) =>
                crumb.isLast ? (
                  <BreadcrumbItem key={crumb.href}>
                    <BreadcrumbPage className="font-medium text-foreground">
                      {crumb.label}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                ) : (
                  <React.Fragment key={crumb.href}>
                    <BreadcrumbItem>
                      <BreadcrumbLink render={<Link href={crumb.href} />}>
                        {crumb.label}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </React.Fragment>
                )
              )
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center gap-1.5 ml-4 shrink-0">
        <QuickAddSlot />
        <KeyboardShortcutsDialog />
        <ThemeToggle />
      </div>
    </header>
  );
}
