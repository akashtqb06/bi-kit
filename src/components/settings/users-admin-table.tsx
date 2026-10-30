'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    UsersIcon,
    PlusIcon,
    SearchIcon,
    MoreVerticalIcon,
    KeyRoundIcon,
    ShieldAlertIcon,
    BanIcon,
    CheckCircle2Icon,
    Trash2Icon,
    CopyIcon,
    CheckIcon,
    RefreshCwIcon,
    LogOutIcon,
    AlertTriangleIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@src/components/auth/user-provider';
import { formatRelativeTime } from '@src/lib/utils';
import { toast } from 'sonner';

export interface UserAdminItem {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    avatarUrl: string | null;
    createdAt: string | Date;
    updatedAt: string | Date;
    lastLoginAt: string | Date | null;
    mustChangePassword: boolean;
}

export function UsersAdminTable() {
    const currentUser = useCurrentUser();
    const [users, setUsers] = useState<UserAdminItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'member'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');

    // Create user dialog state
    const [createOpen, setCreateOpen] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createEmail, setCreateEmail] = useState('');
    const [createRole, setCreateRole] = useState<'member' | 'admin'>('member');
    const [createMustChangePassword, setCreateMustChangePassword] = useState(true);
    const [creating, setCreating] = useState(false);

    // Created password display dialog
    const [tempPasswordDialog, setTempPasswordDialog] = useState<{
        open: boolean;
        email: string;
        password: string;
        copied: boolean;
    }>({ open: false, email: '', password: '', copied: false });

    // Reset password dialog state
    const [resetTarget, setResetTarget] = useState<UserAdminItem | null>(null);
    const [resetting, setResetting] = useState(false);

    // Delete user dialog state
    const [deleteTarget, setDeleteTarget] = useState<UserAdminItem | null>(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    // Revoke sessions dialog state
    const [revokeTarget, setRevokeTarget] = useState<UserAdminItem | null>(null);
    const [revoking, setRevoking] = useState(false);

    // Status change dialog state
    const [statusTarget, setStatusTarget] = useState<{ user: UserAdminItem; newStatus: 'active' | 'disabled' } | null>(null);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    const loadUsers = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/users');
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json.error || 'Failed to load users');
            }
            const json = await res.json();
            setUsers(json.data || []);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error loading users');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            if (!cancelled) {
                void loadUsers();
            }
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [loadUsers]);

    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            const matchesQuery =
                !searchQuery.trim() ||
                u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.email.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesRole = roleFilter === 'all' || u.role === roleFilter;
            const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
            return matchesQuery && matchesRole && matchesStatus;
        });
    }, [users, searchQuery, roleFilter, statusFilter]);

    const activeAdminCount = useMemo(() => {
        return users.filter((u) => u.role === 'admin' && u.status === 'active').length;
    }, [users]);

    // Handle Create User
    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createName.trim() || !createEmail.trim()) {
            toast.error('Name and email are required');
            return;
        }

        try {
            setCreating(true);
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: createName.trim(),
                    email: createEmail.trim(),
                    role: createRole,
                    mustChangePassword: createMustChangePassword,
                }),
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Failed to create user');
            }

            toast.success(`User ${createEmail.trim()} created successfully`);
            setCreateOpen(false);
            setCreateName('');
            setCreateEmail('');
            setCreateRole('member');
            setCreateMustChangePassword(true);

            // Show generated password dialog
            setTempPasswordDialog({
                open: true,
                email: json.data.user.email,
                password: json.data.temporaryPassword,
                copied: false,
            });

            await loadUsers();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to create user');
        } finally {
            setCreating(false);
        }
    };

    // Handle Change Role
    const handleChangeRole = async (targetUser: UserAdminItem, newRole: 'admin' | 'member') => {
        if (targetUser.role === 'admin' && newRole === 'member' && activeAdminCount <= 1) {
            toast.error('Cannot demote the only remaining active administrator.');
            return;
        }

        try {
            const res = await fetch(`/api/admin/users/${targetUser.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole }),
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Failed to update role');
            }
            toast.success(`Role for ${targetUser.email} changed to ${newRole}`);
            await loadUsers();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update role');
        }
    };

    // Handle Status Change (Enable / Disable)
    const handleConfirmStatusChange = async () => {
        if (!statusTarget) return;
        const { user: targetUser, newStatus } = statusTarget;

        if (targetUser.role === 'admin' && newStatus === 'disabled' && activeAdminCount <= 1) {
            toast.error('Cannot disable the only remaining active administrator.');
            setStatusTarget(null);
            return;
        }

        try {
            setUpdatingStatus(true);
            const res = await fetch(`/api/admin/users/${targetUser.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || `Failed to ${newStatus} user`);
            }
            toast.success(
                newStatus === 'disabled'
                    ? `User ${targetUser.email} disabled and all sessions revoked.`
                    : `User ${targetUser.email} enabled.`
            );
            setStatusTarget(null);
            await loadUsers();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : `Failed to update status`);
        } finally {
            setUpdatingStatus(false);
        }
    };

    // Handle Reset Password
    const handleResetPassword = async () => {
        if (!resetTarget) return;

        try {
            setResetting(true);
            const res = await fetch(`/api/admin/users/${resetTarget.id}/reset-password`, {
                method: 'POST',
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Failed to reset password');
            }

            toast.success(`Password reset for ${resetTarget.email}`);
            const targetEmail = resetTarget.email;
            setResetTarget(null);

            setTempPasswordDialog({
                open: true,
                email: targetEmail,
                password: json.data.temporaryPassword,
                copied: false,
            });

            await loadUsers();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to reset password');
        } finally {
            setResetting(false);
        }
    };

    // Handle Revoke Sessions
    const handleRevokeSessions = async () => {
        if (!revokeTarget) return;

        try {
            setRevoking(true);
            const res = await fetch(`/api/admin/users/${revokeTarget.id}/revoke-sessions`, {
                method: 'POST',
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Failed to revoke sessions');
            }
            toast.success(`All active sessions for ${revokeTarget.email} have been revoked.`);
            setRevokeTarget(null);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to revoke sessions');
        } finally {
            setRevoking(false);
        }
    };

    // Handle Delete User
    const handleDeleteUser = async () => {
        if (!deleteTarget) return;
        if (deleteConfirmText.trim().toLowerCase() !== deleteTarget.email.toLowerCase()) {
            toast.error('Email does not match');
            return;
        }

        try {
            setDeleting(true);
            const res = await fetch(`/api/admin/users/${deleteTarget.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmEmail: deleteConfirmText.trim() }),
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Failed to delete user');
            }
            toast.success(`User ${deleteTarget.email} and all owned resources deleted.`);
            setDeleteTarget(null);
            setDeleteConfirmText('');
            await loadUsers();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete user');
        } finally {
            setDeleting(false);
        }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setTempPasswordDialog((prev) => ({ ...prev, copied: true }));
            toast.success('Temporary password copied to clipboard');
            setTimeout(() => {
                setTempPasswordDialog((prev) => ({ ...prev, copied: false }));
            }, 3000);
        } catch {
            toast.error('Failed to copy to clipboard');
        }
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex flex-1 items-center gap-2 max-w-sm">
                    <div className="relative w-full">
                        <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search users..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 text-sm h-9"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Select
                        value={roleFilter}
                        onValueChange={(val) => setRoleFilter(val as 'all' | 'admin' | 'member')}
                    >
                        <SelectTrigger className="h-9 bg-background px-2.5 text-xs font-medium">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-xs">All Roles</SelectItem>
                            <SelectItem value="admin" className="text-xs">Admins</SelectItem>
                            <SelectItem value="member" className="text-xs">Members</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select
                        value={statusFilter}
                        onValueChange={(val) => setStatusFilter(val as 'all' | 'active' | 'disabled')}
                    >
                        <SelectTrigger className="h-9 bg-background px-2.5 text-xs font-medium">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                            <SelectItem value="active" className="text-xs">Active</SelectItem>
                            <SelectItem value="disabled" className="text-xs">Disabled</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void loadUsers()}
                        className="h-9 px-2.5 cursor-pointer"
                        title="Reload users"
                    >
                        <RefreshCwIcon className="size-3.5" />
                    </Button>

                    <Button
                        size="sm"
                        onClick={() => setCreateOpen(true)}
                        className="h-9 gap-1.5 cursor-pointer"
                    >
                        <PlusIcon className="size-4" />
                        <span>Add User</span>
                    </Button>
                </div>
            </div>

            {/* Users Table */}
            <div className="rounded-md border bg-card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[280px]">User</TableHead>
                            <TableHead className="w-[100px]">Role</TableHead>
                            <TableHead className="w-[100px]">Status</TableHead>
                            <TableHead className="w-[140px]">Last Login</TableHead>
                            <TableHead className="w-[140px]">Created</TableHead>
                            <TableHead className="w-[60px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell>
                                        <div className="flex items-center gap-2.5">
                                            <Skeleton className="size-8 rounded-full" />
                                            <div className="space-y-1">
                                                <Skeleton className="h-4 w-28" />
                                                <Skeleton className="h-3 w-40" />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-14" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto rounded" /></TableCell>
                                </TableRow>
                            ))
                        ) : filteredUsers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-sm">
                                    No users found matching your filters.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredUsers.map((u) => {
                                const isSelf = u.id === currentUser?.id;
                                const isLastAdmin = u.role === 'admin' && activeAdminCount <= 1;
                                const initials = u.name
                                    ? u.name.slice(0, 2).toUpperCase()
                                    : u.email.slice(0, 2).toUpperCase();

                                return (
                                    <TableRow key={u.id} className="group">
                                        <TableCell>
                                            <div className="flex items-center gap-2.5">
                                                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                                    {initials}
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-medium text-sm text-foreground truncate max-w-[180px]">
                                                            {u.name}
                                                        </span>
                                                        {isSelf && (
                                                            <Badge variant="outline" className="text-[10px] py-0 px-1 font-normal">
                                                                You
                                                            </Badge>
                                                        )}
                                                        {u.mustChangePassword && (
                                                            <Badge variant="secondary" className="text-[10px] py-0 px-1 bg-amber-500/10 text-amber-600 border-amber-500/20">
                                                                Must Reset Pwd
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                        {u.email}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>

                                        <TableCell>
                                            <Badge
                                                variant={u.role === 'admin' ? 'default' : 'secondary'}
                                                className="text-xs capitalize font-normal"
                                            >
                                                {u.role}
                                            </Badge>
                                        </TableCell>

                                        <TableCell>
                                            <Badge
                                                variant={u.status === 'active' ? 'outline' : 'destructive'}
                                                className={
                                                    u.status === 'active'
                                                        ? 'text-emerald-600 border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs font-normal'
                                                        : 'text-xs font-normal'
                                                }
                                            >
                                                {u.status}
                                            </Badge>
                                        </TableCell>

                                        <TableCell className="text-xs text-muted-foreground">
                                            {u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : 'Never'}
                                        </TableCell>

                                        <TableCell className="text-xs text-muted-foreground">
                                            {formatRelativeTime(u.createdAt)}
                                        </TableCell>

                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger
                                                    render={
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-sm"
                                                            className="size-8 cursor-pointer"
                                                            aria-label="User actions"
                                                        />
                                                    }
                                                >
                                                    <MoreVerticalIcon className="size-4" />
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-52">
                                                    <DropdownMenuGroup>
                                                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                                            Manage {u.name || u.email}
                                                        </DropdownMenuLabel>
                                                    </DropdownMenuGroup>
                                                    <DropdownMenuSeparator />

                                                    {/* Role change */}
                                                    {u.role === 'member' ? (
                                                        <DropdownMenuItem
                                                            onClick={() => void handleChangeRole(u, 'admin')}
                                                            className="text-xs cursor-pointer"
                                                        >
                                                            <ShieldAlertIcon className="mr-2 size-3.5 text-blue-500" />
                                                            Promote to Admin
                                                        </DropdownMenuItem>
                                                    ) : (
                                                        <DropdownMenuItem
                                                            onClick={() => void handleChangeRole(u, 'member')}
                                                            disabled={isLastAdmin}
                                                            className="text-xs cursor-pointer"
                                                        >
                                                            <UsersIcon className="mr-2 size-3.5 text-neutral-500" />
                                                            Demote to Member
                                                        </DropdownMenuItem>
                                                    )}

                                                    {/* Reset Password */}
                                                    <DropdownMenuItem
                                                        onClick={() => setResetTarget(u)}
                                                        className="text-xs cursor-pointer"
                                                    >
                                                        <KeyRoundIcon className="mr-2 size-3.5 text-amber-500" />
                                                        Reset Password
                                                    </DropdownMenuItem>

                                                    {/* Revoke Sessions */}
                                                    <DropdownMenuItem
                                                        onClick={() => setRevokeTarget(u)}
                                                        className="text-xs cursor-pointer"
                                                    >
                                                        <LogOutIcon className="mr-2 size-3.5 text-orange-500" />
                                                        Revoke All Sessions
                                                    </DropdownMenuItem>

                                                    {/* Disable / Enable Account */}
                                                    {u.status === 'active' ? (
                                                        <DropdownMenuItem
                                                            onClick={() => setStatusTarget({ user: u, newStatus: 'disabled' })}
                                                            disabled={isLastAdmin || isSelf}
                                                            className="text-xs cursor-pointer text-amber-600 focus:text-amber-600"
                                                        >
                                                            <BanIcon className="mr-2 size-3.5" />
                                                            Disable User
                                                        </DropdownMenuItem>
                                                    ) : (
                                                        <DropdownMenuItem
                                                            onClick={() => setStatusTarget({ user: u, newStatus: 'active' })}
                                                            className="text-xs cursor-pointer text-emerald-600 focus:text-emerald-600"
                                                        >
                                                            <CheckCircle2Icon className="mr-2 size-3.5" />
                                                            Enable User
                                                        </DropdownMenuItem>
                                                    )}

                                                    <DropdownMenuSeparator />

                                                    {/* Delete User */}
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            setDeleteTarget(u);
                                                            setDeleteConfirmText('');
                                                        }}
                                                        disabled={isSelf || isLastAdmin}
                                                        className="text-xs cursor-pointer text-destructive focus:text-destructive"
                                                    >
                                                        <Trash2Icon className="mr-2 size-3.5" />
                                                        Delete User
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Add User Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add New User</DialogTitle>
                        <DialogDescription>
                            Create an account with a temporary password. The user will be required to change their password on next sign-in.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleCreateUser} className="space-y-4 pt-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="create-name">Full Name</Label>
                            <Input
                                id="create-name"
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                                placeholder="Alice Smith"
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="create-email">Email Address</Label>
                            <Input
                                id="create-email"
                                type="email"
                                value={createEmail}
                                onChange={(e) => setCreateEmail(e.target.value)}
                                placeholder="alice@company.com"
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="create-role">System Role</Label>
                            <Select
                                value={createRole}
                                onValueChange={(val) => setCreateRole(val as 'member' | 'admin')}
                            >
                                <SelectTrigger id="create-role" className="w-full h-9 bg-background px-3 text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="member" className="text-xs">Member (Workbooks, Charts, Queries, Personal Finance)</SelectItem>
                                    <SelectItem value="admin" className="text-xs">Administrator (Platform settings, User admin, Workspace management)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center space-x-2 pt-1">
                            <Checkbox
                                id="must-change-pwd"
                                checked={createMustChangePassword}
                                onCheckedChange={(val) => setCreateMustChangePassword(Boolean(val))}
                            />
                            <Label htmlFor="must-change-pwd" className="text-xs font-normal cursor-pointer">
                                Require password change upon next sign in (recommended)
                            </Label>
                        </div>

                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setCreateOpen(false)}
                                disabled={creating}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={creating}>
                                {creating ? 'Creating...' : 'Create User'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Generated Temporary Password Display Dialog */}
            <Dialog
                open={tempPasswordDialog.open}
                onOpenChange={(open) => {
                    if (!open) {
                        setTempPasswordDialog((prev) => ({ ...prev, open: false }));
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <div className="flex items-center gap-2 text-emerald-600">
                            <CheckCircle2Icon className="size-5" />
                            <DialogTitle className="text-foreground">Temporary Password Generated</DialogTitle>
                        </div>
                        <DialogDescription>
                            Share this temporary password securely with <strong>{tempPasswordDialog.email}</strong>. It will not be shown again.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-3">
                        <div className="flex items-center gap-2 bg-muted/60 p-3 rounded-lg border font-mono text-sm justify-between">
                            <span className="select-all break-all">{tempPasswordDialog.password}</span>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyToClipboard(tempPasswordDialog.password)}
                                className="shrink-0 h-8 gap-1.5 cursor-pointer"
                            >
                                {tempPasswordDialog.copied ? (
                                    <>
                                        <CheckIcon className="size-3.5 text-emerald-600" />
                                        <span className="text-xs">Copied</span>
                                    </>
                                ) : (
                                    <>
                                        <CopyIcon className="size-3.5" />
                                        <span className="text-xs">Copy</span>
                                    </>
                                )}
                            </Button>
                        </div>

                        <Alert className="bg-amber-50/50 border-amber-200/50 dark:bg-amber-950/20 text-xs">
                            <AlertTriangleIcon className="size-4 text-amber-600 shrink-0" />
                            <AlertDescription className="text-amber-700 dark:text-amber-400">
                                The user will be required to create a new password immediately upon logging in.
                            </AlertDescription>
                        </Alert>
                    </div>

                    <DialogFooter>
                        <Button
                            onClick={() => setTempPasswordDialog((prev) => ({ ...prev, open: false }))}
                            className="cursor-pointer"
                        >
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reset Password Confirmation Dialog */}
            <AlertDialog open={Boolean(resetTarget)} onOpenChange={(open) => !open && setResetTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reset User Password?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will generate a temporary password for <strong>{resetTarget?.email}</strong> and immediately revoke all of their existing active sessions.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void handleResetPassword()}
                            disabled={resetting}
                            className="bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
                        >
                            {resetting ? 'Resetting...' : 'Generate Temporary Password'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Revoke Sessions Confirmation Dialog */}
            <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => !open && setRevokeTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Revoke All Active Sessions?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will immediately log out <strong>{revokeTarget?.email}</strong> from all active browser sessions and devices.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void handleRevokeSessions()}
                            disabled={revoking}
                            className="cursor-pointer"
                        >
                            {revoking ? 'Revoking...' : 'Revoke All Sessions'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Disable/Enable Status Confirmation Dialog */}
            <AlertDialog open={Boolean(statusTarget)} onOpenChange={(open) => !open && setStatusTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {statusTarget?.newStatus === 'disabled' ? 'Disable User Account?' : 'Enable User Account?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {statusTarget?.newStatus === 'disabled'
                                ? `Disabling ${statusTarget?.user.email} will immediately revoke all their active sessions and block them from signing in.`
                                : `Enabling ${statusTarget?.user.email} will restore their access to sign in.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={updatingStatus}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void handleConfirmStatusChange()}
                            disabled={updatingStatus}
                            className={
                                statusTarget?.newStatus === 'disabled'
                                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer'
                                    : 'cursor-pointer'
                            }
                        >
                            {updatingStatus ? 'Updating...' : statusTarget?.newStatus === 'disabled' ? 'Disable Account' : 'Enable Account'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete User Typed Confirmation Dialog */}
            <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-destructive flex items-center gap-2">
                            <AlertTriangleIcon className="size-5" />
                            Delete User Account
                        </DialogTitle>
                        <DialogDescription>
                            This action is permanent and cannot be undone. All owned workbooks, queries, charts, data sources, and personal data belonging to <strong>{deleteTarget?.email}</strong> will be permanently deleted.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        <Label htmlFor="delete-confirm" className="text-xs">
                            To confirm deletion, type the user&apos;s email address: <span className="font-mono font-semibold text-foreground">{deleteTarget?.email}</span>
                        </Label>
                        <Input
                            id="delete-confirm"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder={deleteTarget?.email}
                            autoComplete="off"
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteTarget(null)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => void handleDeleteUser()}
                            disabled={deleting || deleteConfirmText.trim().toLowerCase() !== deleteTarget?.email.toLowerCase()}
                            className="cursor-pointer"
                        >
                            {deleting ? 'Deleting...' : 'Permanently Delete User'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
