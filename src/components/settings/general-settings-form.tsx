'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Settings2Icon,
    GlobeIcon,
    ShieldCheckIcon,
    DatabaseIcon,
    ServerIcon,
    SaveIcon,
    RefreshCwIcon,
    CheckCircle2Icon,
} from 'lucide-react';
import { toast } from 'sonner';

interface GeneralSettingsData {
    settings: {
        appName: string;
        allowRegistration: boolean;
        sessionLifetimeDays: number;
        allowedConnectorTypes: string[];
    };
    env: {
        publicUrl: string;
        networkPolicy: string;
        nodeEnv: string;
        secureCookies: boolean;
    };
}

const ALL_CONNECTOR_TYPES = [
    { id: 'postgres', label: 'PostgreSQL', desc: 'PostgreSQL & compatible databases' },
    { id: 'mysql', label: 'MySQL / MariaDB', desc: 'MySQL relational databases' },
    { id: 'sqlite', label: 'SQLite', desc: 'Local file-based SQLite databases' },
    { id: 'mongodb', label: 'MongoDB', desc: 'NoSQL document database' },
    { id: 'mssql', label: 'Microsoft SQL Server', desc: 'Enterprise MSSQL server' },
    { id: 'csv', label: 'CSV / TSV Uploads', desc: 'Flat file delimited uploads' },
    { id: 'excel', label: 'Excel Spreadsheets', desc: 'XLSX workbook files' },
    { id: 'datastore', label: 'Data Store Engine', desc: 'Internal indexed DuckDB / sync storage' },
];

export function GeneralSettingsForm() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [appName, setAppName] = useState('BI Kit');
    const [allowRegistration, setAllowRegistration] = useState(true);
    const [sessionLifetimeDays, setSessionLifetimeDays] = useState(30);
    const [allowedConnectorTypes, setAllowedConnectorTypes] = useState<string[]>([]);
    const [envInfo, setEnvInfo] = useState<{
        publicUrl: string;
        networkPolicy: string;
        nodeEnv: string;
        secureCookies: boolean;
    }>({
        publicUrl: '',
        networkPolicy: '',
        nodeEnv: '',
        secureCookies: false,
    });

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/settings');
            const json = (await res.json()) as { data?: GeneralSettingsData; error?: string };
            if (!res.ok || !json.data) {
                throw new Error(json.error || 'Failed to load settings');
            }
            setAppName(json.data.settings.appName);
            setAllowRegistration(json.data.settings.allowRegistration);
            setSessionLifetimeDays(json.data.settings.sessionLifetimeDays);
            setAllowedConnectorTypes(json.data.settings.allowedConnectorTypes);
            setEnvInfo(json.data.env);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error loading settings');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            if (!cancelled) {
                void loadSettings();
            }
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            const res = await fetch('/api/admin/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    appName: appName.trim(),
                    allowRegistration,
                    sessionLifetimeDays: Number(sessionLifetimeDays) || 30,
                    allowedConnectorTypes,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Failed to save settings');
            }
            toast.success('System settings saved successfully');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error saving settings');
        } finally {
            setSaving(false);
        }
    };

    const toggleConnector = (id: string) => {
        setAllowedConnectorTypes((prev) =>
            prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                <RefreshCwIcon className="size-4 animate-spin" />
                <span>Loading system settings...</span>
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="space-y-6">
            {/* General App Configuration */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Settings2Icon className="size-5 text-muted-foreground" />
                        <CardTitle>Instance Configuration</CardTitle>
                    </div>
                    <CardDescription>
                        Customise application identity, registration availability, and authentication token durations.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2 max-w-md">
                        <Label htmlFor="app-name">Application Name</Label>
                        <Input
                            id="app-name"
                            value={appName}
                            onChange={(e) => setAppName(e.target.value)}
                            placeholder="BI Kit"
                            required
                        />
                        <p className="text-xs text-muted-foreground">
                            Displayed in navigation headers, page titles, and email templates.
                        </p>
                    </div>

                    <div className="grid gap-2 max-w-xs">
                        <Label htmlFor="session-lifetime">Session Lifetime (Days)</Label>
                        <Input
                            id="session-lifetime"
                            type="number"
                            min={1}
                            max={365}
                            value={sessionLifetimeDays}
                            onChange={(e) => setSessionLifetimeDays(parseInt(e.target.value, 10) || 30)}
                            required
                        />
                        <p className="text-xs text-muted-foreground">
                            Inactivity duration before authentication tokens expire (default 30 days).
                        </p>
                    </div>

                    <div className="flex items-start space-x-2.5 pt-2">
                        <Checkbox
                            id="allow-registration"
                            checked={allowRegistration}
                            onCheckedChange={(val) => setAllowRegistration(Boolean(val))}
                        />
                        <div className="grid gap-1 leading-none">
                            <Label htmlFor="allow-registration" className="cursor-pointer text-sm font-medium">
                                Allow open user registration
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                When disabled, new users can only be invited and created by workspace administrators.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Allowed Connectors Policy */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <DatabaseIcon className="size-5 text-muted-foreground" />
                        <CardTitle>Allowed Data Connectors</CardTitle>
                    </div>
                    <CardDescription>
                        Select which data source drivers are permitted across workbooks and datasets. Disabling a driver prevents creating new connections of that type.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {ALL_CONNECTOR_TYPES.map((c) => {
                            const isChecked = allowedConnectorTypes.includes(c.id);
                            return (
                                <div
                                    key={c.id}
                                    onClick={() => toggleConnector(c.id)}
                                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                        isChecked ? 'bg-muted/40 border-primary/30' : 'bg-background hover:bg-muted/20 opacity-70'
                                    }`}
                                >
                                    <Checkbox
                                        id={`connector-${c.id}`}
                                        checked={isChecked}
                                        onCheckedChange={() => toggleConnector(c.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="mt-0.5"
                                    />
                                    <div className="space-y-0.5 min-w-0">
                                        <Label htmlFor={`connector-${c.id}`} className="text-sm font-medium cursor-pointer">
                                            {c.label}
                                        </Label>
                                        <p className="text-xs text-muted-foreground truncate">{c.desc}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Read-Only Platform & Environment Info */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <ServerIcon className="size-5 text-muted-foreground" />
                        <CardTitle>Environment & Security Status</CardTitle>
                    </div>
                    <CardDescription>
                        Read-only deployment parameters derived from server environment variables.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                                <GlobeIcon className="size-4" /> Public Application URL:
                            </span>
                            <span className="font-mono text-xs bg-muted px-2 py-1 rounded border">
                                {envInfo.publicUrl}
                            </span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                                <ShieldCheckIcon className="size-4" /> Outbound Network Guard:
                            </span>
                            <span className="text-xs font-medium text-foreground">
                                {envInfo.networkPolicy}
                            </span>
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">Node Environment:</span>
                            <Badge variant="outline" className="font-mono text-xs capitalize">
                                {envInfo.nodeEnv}
                            </Badge>
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">HTTPS Secure Cookie Flag:</span>
                            {envInfo.secureCookies ? (
                                <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-50/50">
                                    <CheckCircle2Icon className="size-3 mr-1" />
                                    Active (Secure)
                                </Badge>
                            ) : (
                                <Badge variant="secondary" className="text-xs">
                                    Development (HTTP)
                                </Badge>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Save Button Footer */}
            <div className="flex justify-end pt-2">
                <Button type="submit" disabled={saving} className="gap-2 cursor-pointer">
                    <SaveIcon className="size-4" />
                    <span>{saving ? 'Saving Changes...' : 'Save Settings'}</span>
                </Button>
            </div>
        </form>
    );
}
