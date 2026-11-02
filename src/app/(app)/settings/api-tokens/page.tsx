import React, { Suspense } from 'react';
import { requireUser } from '@src/lib/auth/dal';
import { listTokens } from '@src/lib/auth/api-tokens';
import { ApiTokensView } from '@src/components/settings/api-tokens-view';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function ApiTokensSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4 border rounded-md">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

async function ApiTokensPageContent() {
  const user = await requireUser('/settings/api-tokens');
  const tokens = await listTokens(user.id);
  // Sort: active tokens first, then newest
  tokens.sort((a, b) => {
    if (!a.revokedAt && b.revokedAt) return -1;
    if (a.revokedAt && !b.revokedAt) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return <ApiTokensView initialTokens={tokens} />;
}

export default function SettingsApiTokensPage() {
  return (
    <Suspense fallback={<ApiTokensSkeleton />}>
      <ApiTokensPageContent />
    </Suspense>
  );
}
