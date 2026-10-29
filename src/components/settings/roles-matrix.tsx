'use client';

import React from 'react';
import {
    ShieldCheckIcon,
    UserCheckIcon,
    CheckCircle2Icon,
    XCircleIcon,
    LockIcon,
    SparklesIcon,
    InfoIcon,
    LayersIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

interface MatrixRow {
    resource: string;
    description: string;
    adminAccess: string;
    adminBadge: 'full' | 'restricted' | 'owner_only';
    memberAccess: string;
    memberBadge: 'own' | 'none' | 'owner_only';
    policyRule: string;
}

const CAPABILITY_MATRIX: MatrixRow[] = [
    {
        resource: 'Workbooks & Dashboards',
        description: 'Analysis canvases, query compositions, and interactive dashboards',
        adminAccess: 'View, Create, Edit, Delete (Workspace-wide)',
        adminBadge: 'full',
        memberAccess: 'View, Create, Edit, Delete (Own resources only)',
        memberBadge: 'own',
        policyRule: 'can(user, action, { type: "dashboard" | "workbook" })',
    },
    {
        resource: 'Queries & Visualisations',
        description: 'SQL queries, visual pipeline steps, and Recharts widgets',
        adminAccess: 'View, Create, Edit, Delete (Workspace-wide)',
        adminBadge: 'full',
        memberAccess: 'View, Create, Edit, Delete (Attached to accessible workbooks)',
        memberBadge: 'own',
        policyRule: 'can(user, action, { type: "query" | "chart" })',
    },
    {
        resource: 'Data Sources & Connectors',
        description: 'External database configurations (PostgreSQL, MySQL, SQLite, MongoDB)',
        adminAccess: 'View, Create, Edit, Delete, Test (All data sources)',
        adminBadge: 'full',
        memberAccess: 'View, Create, Edit, Delete, Test (Own connections only)',
        memberBadge: 'own',
        policyRule: 'can(user, action, { type: "data_source" })',
    },
    {
        resource: 'User Directory & Roles',
        description: 'Account provisioning, role promotion, password reset, session revocation',
        adminAccess: 'Full administration (Protected last-admin safety)',
        adminBadge: 'full',
        memberAccess: 'No access (Manage own profile & password only)',
        memberBadge: 'none',
        policyRule: 'user.role === "admin" required',
    },
    {
        resource: 'General Settings & Audit Logs',
        description: 'App naming, registration toggle, connector whitelisting, audit log viewer & purge',
        adminAccess: 'Full access (Manage platform preferences & audit logs)',
        adminBadge: 'full',
        memberAccess: 'No access',
        memberBadge: 'none',
        policyRule: 'user.role === "admin" required',
    },
    {
        resource: 'Data Store Tables (DuckDB)',
        description: 'Locally synchronized analytical tables and materialized caches',
        adminAccess: 'Own tables only (Strict Owner-Only — No Admin Override)',
        adminBadge: 'owner_only',
        memberAccess: 'Own tables only (Strict Owner-Only)',
        memberBadge: 'owner_only',
        policyRule: 'isDataStoreResource: resource.ownerId === user.id',
    },
    {
        resource: 'Personal Finance Module',
        description: 'Bank accounts, transactions, valuations, budgets, and recurring rules',
        adminAccess: 'Own finances only (Strict Owner-Only — Zero Admin Peeking)',
        adminBadge: 'owner_only',
        memberAccess: 'Own finances only (Strict Owner-Only)',
        memberBadge: 'owner_only',
        policyRule: 'isFinanceResource: resource.ownerId === user.id',
    },
];

function renderBadge(badgeType: 'full' | 'restricted' | 'owner_only' | 'own' | 'none') {
    switch (badgeType) {
        case 'full':
            return (
                <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 text-[11px] font-normal gap-1">
                    <CheckCircle2Icon className="size-3" />
                    Full Access
                </Badge>
            );
        case 'own':
            return (
                <Badge variant="secondary" className="text-[11px] font-normal gap-1">
                    <UserCheckIcon className="size-3" />
                    Own Resources
                </Badge>
            );
        case 'owner_only':
            return (
                <Badge variant="outline" className="text-blue-600 border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 text-[11px] font-normal gap-1">
                    <LockIcon className="size-3" />
                    Strict Owner-Only
                </Badge>
            );
        case 'none':
            return (
                <Badge variant="outline" className="text-muted-foreground text-[11px] font-normal gap-1 opacity-70">
                    <XCircleIcon className="size-3" />
                    No Access
                </Badge>
            );
        default:
            return null;
    }
}

export function RolesMatrix() {
    return (
        <div className="space-y-6">
            {/* Roles Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ShieldCheckIcon className="size-5 text-primary" />
                                <CardTitle className="text-base">Administrator</CardTitle>
                            </div>
                            <Badge variant="default" className="text-xs font-mono">
                                role: admin
                            </Badge>
                        </div>
                        <CardDescription className="text-xs">
                            Full workspace administration, user lifecycle management, and global platform configuration.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground space-y-2">
                        <p>
                            Administrators possess elevated workspace privileges across shared analytics entities (workbooks, queries, charts, dashboards, and data sources).
                        </p>
                        <p className="text-foreground/90 font-medium">
                            Security Boundary: In accordance with our privacy contract, administrators can NEVER view, query, or modify another member&apos;s personal finance data or personal data store sync tables.
                        </p>
                    </CardContent>
                </Card>

                <Card className="border">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <UserCheckIcon className="size-5 text-muted-foreground" />
                                <CardTitle className="text-base">Member</CardTitle>
                            </div>
                            <Badge variant="secondary" className="text-xs font-mono">
                                role: member
                            </Badge>
                        </div>
                        <CardDescription className="text-xs">
                            Standard workspace user for creating analytical workbooks and managing personal data.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground space-y-2">
                        <p>
                            Members create and manage their own workbooks, dashboards, charts, queries, and data sources. They have complete control over their personal finance module and private data store syncs.
                        </p>
                        <p>
                            Members cannot access administrative settings, other users&apos; accounts, audit logs, or platform-wide configuration.
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Capability Matrix Table */}
            <Card className="border">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <LayersIcon className="size-5 text-muted-foreground" />
                        <CardTitle>Capability Matrix</CardTitle>
                    </div>
                    <CardDescription>
                        Permissions architecture enforced across API route handlers and server actions, derived from <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">src/lib/auth/policy.ts</code>.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[220px]">Resource Domain</TableHead>
                                <TableHead className="w-[240px]">Administrator Capability</TableHead>
                                <TableHead className="w-[240px]">Member Capability</TableHead>
                                <TableHead>Policy Rule</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {CAPABILITY_MATRIX.map((row) => (
                                <TableRow key={row.resource} className="text-xs">
                                    <TableCell>
                                        <div className="space-y-0.5">
                                            <span className="font-semibold text-foreground text-sm">
                                                {row.resource}
                                            </span>
                                            <p className="text-xs text-muted-foreground leading-snug">
                                                {row.description}
                                            </p>
                                        </div>
                                    </TableCell>

                                    <TableCell>
                                        <div className="space-y-1.5">
                                            <div>{renderBadge(row.adminBadge)}</div>
                                            <p className="text-xs text-muted-foreground">
                                                {row.adminAccess}
                                            </p>
                                        </div>
                                    </TableCell>

                                    <TableCell>
                                        <div className="space-y-1.5">
                                            <div>{renderBadge(row.memberBadge)}</div>
                                            <p className="text-xs text-muted-foreground">
                                                {row.memberAccess}
                                            </p>
                                        </div>
                                    </TableCell>

                                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                                        <span className="bg-muted px-1.5 py-0.5 rounded border border-border/40">
                                            {row.policyRule}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Sharing & Granular RBAC Roadmap Note */}
            <Alert className="bg-muted/40 border-primary/20">
                <SparklesIcon className="size-5 text-primary shrink-0" />
                <AlertTitle className="text-sm font-semibold">
                    Sharing & Granular RBAC Roadmap
                </AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground space-y-1 pt-1">
                    <p>
                        Role-based sharing rules, custom groups, and per-dashboard access controls are planned for an upcoming phase.
                    </p>
                    <p>
                        The policy layer in <code className="font-mono font-medium text-foreground">src/lib/auth/policy.ts</code> remains the single extension point: when the <code className="font-mono">resource_shares</code> table is added, resource grants will union directly into these scopes without rewriting UI components or route handlers.
                    </p>
                </AlertDescription>
            </Alert>
        </div>
    );
}
