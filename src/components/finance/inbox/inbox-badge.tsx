'use client';

import React, { useEffect, useState } from 'react';

export function InboxCountBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchCount = async () => {
      try {
        const res = await fetch('/api/finance/inbox?limit=1');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && typeof data.pendingCount === 'number') {
            setCount(data.pendingCount);
          }
        }
      } catch {
        // Silently ignore badge fetch errors
      }
    };

    fetchCount();
    // Poll every 30s
    const timer = setInterval(fetchCount, 30_000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  if (!count || count <= 0) return null;

  return (
    <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold bg-amber-500 text-white leading-none shadow-xs">
      {count > 99 ? '99+' : count}
    </span>
  );
}
