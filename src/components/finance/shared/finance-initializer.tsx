'use client';

import { useEffect } from 'react';
import { useCurrentUser } from '@src/components/auth/user-provider';
import { useFinanceStore } from './finance-store';

export function FinanceInitializer() {
  const user = useCurrentUser();
  const { initialize, reset, userId: storeUserId } = useFinanceStore();

  useEffect(() => {
    if (user?.id) {
      if (storeUserId && storeUserId !== user.id) {
        reset();
      }
      void initialize(user.id);
    } else if (user === null) {
      reset();
    }
  }, [user?.id, user, initialize, reset, storeUserId]);

  return null;
}
