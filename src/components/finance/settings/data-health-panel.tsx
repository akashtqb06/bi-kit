'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ActivityIcon,
  RefreshCwIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  DatabaseIcon,
  LayersIcon,
} from 'lucide-react';
import { formatINR } from '../shared/format';

interface AccountReconciliation {
  accountId: string;
  name: string;
  kind: string;
  class: string;
  ledgerBalance: number;
  outstanding: number;
}

interface DiagnosticsData {
  backend: string;
  databaseConnected: boolean;
  asOf: string;
  user: {
    id: string;
    email: string;
  };
  counts: {
    accounts: number;
    transactions: number;
  };
  reconciliation: {
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
    accounts: AccountReconciliation[];
  };
}

export function DataHealthPanel() {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/diagnostics');
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Diagnostics are only available to administrative accounts.');
        }
        throw new Error(`Failed to load diagnostics (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    fetch('/api/finance/diagnostics')
      .then((res) => {
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('Diagnostics are only available to administrative accounts.');
          }
          throw new Error(`Failed to load diagnostics (${res.status})`);
        }
        return res.json();
      })
      .then((json) => {
        if (!ignore) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ActivityIcon className="size-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Data Health Diagnostics</CardTitle>
              <CardDescription className="text-xs">
                Independent SQL verification of ledger balances and transaction integrity.
              </CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8 gap-1.5"
            onClick={fetchDiagnostics}
            disabled={loading}
          >
            <RefreshCwIcon className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {loading && !data && (
          <div className="py-6 text-center text-xs text-muted-foreground animate-pulse">
            Running data integrity and reconciliation checks...
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 flex items-start gap-2.5">
            <AlertCircleIcon className="size-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive leading-relaxed">{error}</p>
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* Health summary badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-muted/40 border space-y-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <DatabaseIcon className="size-3" />
                  <span>Backend</span>
                </span>
                <div className="text-xs font-bold text-foreground uppercase">
                  {data.backend}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/40 border space-y-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <CheckCircle2Icon className="size-3 text-emerald-500" />
                  <span>DB Status</span>
                </span>
                <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {data.databaseConnected ? 'Connected' : 'Disconnected'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/40 border space-y-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <LayersIcon className="size-3" />
                  <span>Accounts</span>
                </span>
                <div className="text-xs font-bold text-foreground">
                  {data.counts.accounts} active
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/40 border space-y-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <ActivityIcon className="size-3" />
                  <span>Transactions</span>
                </span>
                <div className="text-xs font-bold text-foreground">
                  {data.counts.transactions} records
                </div>
              </div>
            </div>

            {/* Reconciliation Totals */}
            <div className="p-3 rounded-lg bg-muted/20 border space-y-2">
              <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>SQL Ledger Reconciliation</span>
                <span className="text-[10px] text-muted-foreground">As of {data.asOf}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="p-2 rounded bg-background border">
                  <div className="text-[10px] text-muted-foreground">Total Assets</div>
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {formatINR(data.reconciliation.totalAssets)}
                  </div>
                </div>
                <div className="p-2 rounded bg-background border">
                  <div className="text-[10px] text-muted-foreground">Total Liabilities</div>
                  <div className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                    {formatINR(data.reconciliation.totalLiabilities)}
                  </div>
                </div>
                <div className="p-2 rounded bg-background border">
                  <div className="text-[10px] text-muted-foreground">Net Worth</div>
                  <div className="text-xs font-bold text-foreground mt-0.5">
                    {formatINR(data.reconciliation.netWorth)}
                  </div>
                </div>
              </div>
            </div>

            {/* Account List */}
            {data.reconciliation.accounts.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground px-1">
                  Reconciled Accounts ({data.reconciliation.accounts.length})
                </div>
                <div className="divide-y rounded-lg border bg-background text-xs">
                  {data.reconciliation.accounts.map((acc) => (
                    <div
                      key={acc.accountId}
                      className="p-2.5 flex items-center justify-between hover:bg-muted/30 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="font-medium text-foreground">{acc.name}</div>
                        <div className="text-[10px] text-muted-foreground capitalize flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                            {acc.kind.replace('_', ' ')}
                          </Badge>
                          <span>Class: {acc.class}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-semibold ${
                            acc.class === 'liability'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-foreground'
                          }`}
                        >
                          {acc.class === 'liability'
                            ? `Due: ${formatINR(acc.outstanding)}`
                            : formatINR(acc.ledgerBalance)}
                        </div>
                        {acc.class === 'liability' && (
                          <div className="text-[10px] text-muted-foreground">
                            Raw: {formatINR(acc.ledgerBalance)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
