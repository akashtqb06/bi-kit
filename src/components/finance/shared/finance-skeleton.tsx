import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function FinancePageSkeleton({
  title = 'Loading...',
  cardCount = 3,
}: {
  title?: string;
  cardCount?: number;
}) {
  return (
    <div className="space-y-6 max-w-7xl mx-auto" aria-busy="true" aria-label={title}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: cardCount }).map((_, i) => (
          <Card key={i} className="shadow-xs">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-7 w-36" />
              <Skeleton className="h-3 w-48" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-xs">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function FinancePlaceholderView({
  title,
  description,
  session,
}: {
  title: string;
  description: string;
  session: string;
}) {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">
          Owner: {session}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-dashed bg-muted/20 shadow-xs">
          <CardHeader className="pb-2">
            <div className="text-xs font-medium text-muted-foreground">Scaffold Placeholder</div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-sm font-semibold text-foreground">Waiting for implementation</div>
            <p className="text-xs text-muted-foreground">
              Module contract is frozen. {session} will implement domain logic and UI.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
