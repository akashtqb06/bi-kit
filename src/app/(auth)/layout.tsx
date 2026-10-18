import type { ReactNode } from 'react';
import { BarChart3Icon } from 'lucide-react';
import { ThemeToggle } from '@src/components/layout/theme-toggle';

export default function AuthLayout({ children }: { children: ReactNode }) {
    return (
        <main className="relative flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-12">
            <div className="absolute right-4 top-4">
                <ThemeToggle />
            </div>
            <div className="flex w-full max-w-sm flex-col items-center gap-6">
                <div className="flex items-center gap-2.5">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <BarChart3Icon className="size-5" />
                    </span>
                    <span className="text-lg font-semibold tracking-tight">BI Kit</span>
                </div>
                {children}
                <p className="text-center text-xs text-muted-foreground">Local-first business intelligence</p>
            </div>
        </main>
    );
}
