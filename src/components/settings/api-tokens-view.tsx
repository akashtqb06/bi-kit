'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { KeyRoundIcon, CopyIcon, CheckIcon, Trash2Icon, AlertTriangleIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { ApiTokenListItem } from '@src/lib/auth/api-tokens';

interface ApiTokensViewProps {
  initialTokens: ApiTokenListItem[];
}

export function ApiTokensView({ initialTokens }: ApiTokensViewProps) {
  const [tokens, setTokens] = useState<ApiTokenListItem[]>(initialTokens);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['finance:ingest']);
  const [expiryOption, setExpiryOption] = useState<string>('365');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // One-time token view modal state
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Token name is required');
      return;
    }
    if (scopes.length === 0) {
      toast.error('Select at least one scope');
      return;
    }

    setIsSubmitting(true);
    try {
      let expiresAt: string | undefined = undefined;
      if (expiryOption !== 'never') {
        const days = parseInt(expiryOption, 10);
        const exp = new Date();
        exp.setDate(exp.getDate() + days);
        expiresAt = exp.toISOString();
      }

      const res = await fetch('/api/settings/api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scopes, expiresAt }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create token');
      }

      const data = await res.json();
      setTokens((prev) => [data.record, ...prev]);
      setCreatedToken(data.token);
      setIsCreateOpen(false);
      setName('');
      setScopes(['finance:ingest']);
      setExpiryOption('365');
      toast.success('API token created successfully');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API token? Any integrations using it will immediately stop working.')) {
      return;
    }

    try {
      const res = await fetch(`/api/settings/api-tokens/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to revoke token');
      }

      setTokens((prev) =>
        prev.map((t) => (t.id === id ? { ...t, revokedAt: new Date() } : t))
      );
      toast.success('Token revoked');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke token');
    }
  };

  const copyToClipboard = () => {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken);
      setCopied(true);
      toast.success('Token copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRoundIcon className="size-5" />
              API Tokens
            </CardTitle>
            <CardDescription>
              Create personal API tokens to ingest transactions from external tools (n8n, email alerts, custom scripts).
              Tokens are rate-limited and never grant admin or settings access.
            </CardDescription>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} size="sm">
            Create Token
          </Button>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg border-dashed p-6">
              <KeyRoundIcon className="size-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium">No API tokens created</p>
              <p className="text-xs mt-1 max-w-sm mx-auto">
                Generate an API token to feed transactions into your Personal Finance Inbox via automated workflows.
              </p>
            </div>
          ) : (
            <div className="divide-y rounded-md border">
              {tokens.map((token) => {
                const isRevoked = Boolean(token.revokedAt);
                const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();
                const isActive = !isRevoked && !isExpired;

                return (
                  <div
                    key={token.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{token.name}</span>
                        {isActive && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">Active</Badge>}
                        {isRevoked && <Badge variant="secondary" className="text-xs">Revoked</Badge>}
                        {isExpired && !isRevoked && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">
                          {token.prefix}••••••••
                        </code>
                        <span>•</span>
                        <span>
                          {token.lastUsedAt
                            ? `Last used: ${new Date(token.lastUsedAt).toLocaleDateString()}`
                            : 'Never used'}
                        </span>
                        <span>•</span>
                        <span>
                          {token.expiresAt
                            ? `Expires: ${new Date(token.expiresAt).toLocaleDateString()}`
                            : 'No expiration'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1">
                        {token.scopes.map((s) => (
                          <Badge key={s} variant="secondary" className="text-[11px] font-normal">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {isActive && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRevoke(token.id)}
                        >
                          <Trash2Icon className="size-4 mr-1" />
                          Revoke
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Token Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create API Token</DialogTitle>
              <DialogDescription>
                Generate a bearer token with restricted scopes to send transactions to your Inbox.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="token-name">Token Name</Label>
                <Input
                  id="token-name"
                  placeholder="e.g. n8n Bank Alert Ingest"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>Scopes</Label>
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start space-x-2">
                    <Checkbox
                      id="scope-ingest"
                      checked={scopes.includes('finance:ingest')}
                      onCheckedChange={(checked) => {
                        setScopes((prev) =>
                          checked
                            ? [...prev, 'finance:ingest']
                            : prev.filter((s) => s !== 'finance:ingest')
                        );
                      }}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label htmlFor="scope-ingest" className="text-sm font-medium leading-none cursor-pointer">
                        finance:ingest
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Post transactions directly to your Inbox for review (required for n8n/email ingesters).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2 pt-2 border-t">
                    <Checkbox
                      id="scope-read"
                      checked={scopes.includes('finance:read')}
                      onCheckedChange={(checked) => {
                        setScopes((prev) =>
                          checked
                            ? [...prev, 'finance:read']
                            : prev.filter((s) => s !== 'finance:read')
                        );
                      }}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label htmlFor="scope-read" className="text-sm font-medium leading-none cursor-pointer">
                        finance:read
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Read finance accounts and transaction summaries.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiry">Expiration</Label>
                <Select value={expiryOption} onValueChange={(val) => setExpiryOption(val || '365')}>
                  <SelectTrigger id="expiry">
                    <SelectValue placeholder="Select expiry period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year (Recommended)</SelectItem>
                    <SelectItem value="never">No expiration</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !name.trim()}>
                {isSubmitting ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* One-time Token Display Dialog */}
      <Dialog open={Boolean(createdToken)} onOpenChange={(open) => !open && setCreatedToken(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <KeyRoundIcon className="size-5" />
              Token Generated Successfully
            </DialogTitle>
            <DialogDescription>
              Copy this token now. It will <strong>never be shown again</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 rounded-lg text-xs">
              <AlertTriangleIcon className="size-5 shrink-0 text-amber-600" />
              <span>
                Store this token safely in your n8n credentials or environment variables. It has write access to your inbox.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={createdToken || ''}
                className="font-mono text-xs bg-muted cursor-text"
                onFocus={(e) => e.target.select()}
              />
              <Button type="button" variant="outline" size="icon" onClick={copyToClipboard}>
                {copied ? <CheckIcon className="size-4 text-emerald-600" /> : <CopyIcon className="size-4" />}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setCreatedToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
