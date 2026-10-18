import React from "react";

export function OperationChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 mx-1 rounded text-[11px] font-mono font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 leading-none">
      {children}
    </span>
  );
}

