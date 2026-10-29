import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@src/lib/auth/dal';
import { checkSetupRedirect } from '@src/lib/finance/setup/service';

async function HomeRedirect(): Promise<null> {
  const user = await getCurrentUser();
  if (user) {
    const { shouldRedirect } = await checkSetupRedirect(user.id);
    if (shouldRedirect) {
      redirect('/finance/setup');
    }
  }
  redirect('/workbooks');
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeRedirect />
    </Suspense>
  );
}
