'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    AlertTriangleIcon,
    KeyRoundIcon,
    Loader2Icon,
    ShieldAlertIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { changePasswordAction, deleteAccountAction } from '@src/lib/auth/settings-actions';
import type { SafeUser } from '@src/lib/auth/types';
import { cn } from 'cn';

interface SecurityFormProps {
    user: SafeUser;
    isLastAdmin: boolean;
}

export function SecurityForm({ user, isLastAdmin }: SecurityFormProps) {
    const router = useRouter();

    // Password form state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
    const [passwordFormError, setPasswordFormError] = useState<string | null>(null);
    const [isChangingPassword, startPasswordTransition] = useTransition();

    // Delete account state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteEmail, setDeleteEmail] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
    const [deleteFormError, setDeleteFormError] = useState<string | null>(null);
    const [isDeletingAccount, startDeleteTransition] = useTransition();

    const handleChangePassword = (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordErrors({});
        setPasswordFormError(null);

        const formData = new FormData();
        formData.append('currentPassword', currentPassword);
        formData.append('newPassword', newPassword);
        formData.append('confirmPassword', confirmPassword);

        startPasswordTransition(async () => {
            const res = await changePasswordAction({ ok: false }, formData);
            if (res.ok) {
                toast.success('Password changed successfully');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setPasswordErrors({});
                setPasswordFormError(null);
            } else {
                if (res.fieldErrors) {
                    setPasswordErrors(res.fieldErrors);
                }
                if (res.formError) {
                    setPasswordFormError(res.formError);
                    toast.error(res.formError);
                } else if (res.fieldErrors) {
                    const firstMsg = Object.values(res.fieldErrors)[0];
                    if (firstMsg) toast.error(firstMsg);
                }
            }
        });
    };

    const handleDeleteAccount = (e: React.FormEvent) => {
        e.preventDefault();
        setDeleteErrors({});
        setDeleteFormError(null);

        if (deleteEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
            setDeleteErrors({ email: 'Email address does not match' });
            return;
        }

        const formData = new FormData();
        formData.append('email', deleteEmail.trim());
        formData.append('password', deletePassword);

        startDeleteTransition(async () => {
            const res = await deleteAccountAction({ ok: false }, formData);
            if (res.ok) {
                toast.success('Your account has been deleted');
                setDeleteDialogOpen(false);
                router.push('/login');
            } else {
                if (res.fieldErrors) {
                    setDeleteErrors(res.fieldErrors);
                }
                if (res.formError) {
                    setDeleteFormError(res.formError);
                    toast.error(res.formError);
                }
            }
        });
    };

    return (
        <div className="space-y-6">
            {/* Change Password Card */}
            <Card>
                <form onSubmit={handleChangePassword}>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <KeyRoundIcon className="size-5 text-muted-foreground" />
                            <CardTitle>Change Password</CardTitle>
                        </div>
                        <CardDescription>
                            Update your login password. Changing your password will sign out all other devices.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {user.mustChangePassword && (
                            <Alert className="bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400">
                                <AlertTriangleIcon className="size-4 shrink-0" />
                                <AlertTitle>Password Change Required</AlertTitle>
                                <AlertDescription>
                                    Your account has a temporary password or was flagged for a password reset by an administrator. You must set a new password before you can access other areas of the application.
                                </AlertDescription>
                            </Alert>
                        )}
                        {passwordFormError && (
                            <Alert variant="destructive">
                                <AlertTriangleIcon className="size-4" />
                                <AlertTitle>Unable to change password</AlertTitle>
                                <AlertDescription>{passwordFormError}</AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="current-password">
                                Current Password <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="current-password"
                                name="currentPassword"
                                type="password"
                                value={currentPassword}
                                onChange={(e) => {
                                    setCurrentPassword(e.target.value);
                                    if (passwordErrors.currentPassword) {
                                        setPasswordErrors((prev) => ({ ...prev, currentPassword: '' }));
                                    }
                                }}
                                required
                                autoComplete="current-password"
                                className={cn(passwordErrors.currentPassword && 'border-destructive focus-visible:ring-destructive')}
                            />
                            {passwordErrors.currentPassword && (
                                <p className="text-xs text-destructive">{passwordErrors.currentPassword}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="new-password">
                                New Password <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="new-password"
                                name="newPassword"
                                type="password"
                                value={newPassword}
                                onChange={(e) => {
                                    setNewPassword(e.target.value);
                                    if (passwordErrors.newPassword) {
                                        setPasswordErrors((prev) => ({ ...prev, newPassword: '' }));
                                    }
                                }}
                                required
                                minLength={8}
                                maxLength={128}
                                autoComplete="new-password"
                                className={cn(passwordErrors.newPassword && 'border-destructive focus-visible:ring-destructive')}
                            />
                            {passwordErrors.newPassword ? (
                                <p className="text-xs text-destructive">{passwordErrors.newPassword}</p>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    Must be at least 8 characters and differ from your current password.
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">
                                Confirm New Password <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="confirm-password"
                                name="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => {
                                    setConfirmPassword(e.target.value);
                                    if (passwordErrors.confirmPassword) {
                                        setPasswordErrors((prev) => ({ ...prev, confirmPassword: '' }));
                                    }
                                }}
                                required
                                minLength={8}
                                maxLength={128}
                                autoComplete="new-password"
                                className={cn(passwordErrors.confirmPassword && 'border-destructive focus-visible:ring-destructive')}
                            />
                            {passwordErrors.confirmPassword && (
                                <p className="text-xs text-destructive">{passwordErrors.confirmPassword}</p>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="border-t pt-4 flex justify-end">
                        <Button
                            type="submit"
                            disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                        >
                            {isChangingPassword && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                            Update password
                        </Button>
                    </CardFooter>
                </form>
            </Card>

            {/* Danger Zone Card */}
            <Card className="border-destructive/30 bg-destructive/5">
                <CardHeader>
                    <div className="flex items-center gap-2 text-destructive">
                        <ShieldAlertIcon className="size-5" />
                        <CardTitle className="text-destructive">Danger Zone</CardTitle>
                    </div>
                    <CardDescription>
                        Permanently delete your account and remove all personal access credentials.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isLastAdmin ? (
                        <Alert variant="destructive">
                            <AlertTriangleIcon className="size-4" />
                            <AlertTitle>Account deletion disabled</AlertTitle>
                            <AlertDescription>
                                You are currently the only active administrator on this system. You cannot delete your account until you promote another active user to the administrator role.
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h4 className="text-sm font-medium">Delete this account</h4>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Once deleted, your account cannot be recovered.
                                </p>
                            </div>

                            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                                <AlertDialogTrigger render={
                                    <Button variant="destructive" size="sm">
                                        Delete account
                                    </Button>
                                } />
                                <AlertDialogContent className="max-w-md">
                                    <form onSubmit={handleDeleteAccount} className="space-y-4">
                                        <AlertDialogHeader>
                                            <AlertDialogTitle className="text-destructive">
                                                Delete account
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Warning: All your workbooks, data sources, and dashboards will be permanently deleted. This action is irreversible.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>

                                        {deleteFormError && (
                                            <Alert variant="destructive">
                                                <AlertTriangleIcon className="size-4" />
                                                <AlertTitle>Error</AlertTitle>
                                                <AlertDescription>{deleteFormError}</AlertDescription>
                                            </Alert>
                                        )}

                                        <div className="space-y-3 py-2">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="delete-email-confirm" className="text-xs">
                                                    Confirm your email (<span className="font-semibold">{user.email}</span>)
                                                </Label>
                                                <Input
                                                    id="delete-email-confirm"
                                                    value={deleteEmail}
                                                    onChange={(e) => {
                                                        setDeleteEmail(e.target.value);
                                                        if (deleteErrors.email) {
                                                            setDeleteErrors((prev) => ({ ...prev, email: '' }));
                                                        }
                                                    }}
                                                    placeholder={user.email}
                                                    required
                                                    className={cn(deleteErrors.email && 'border-destructive focus-visible:ring-destructive')}
                                                />
                                                {deleteErrors.email && (
                                                    <p className="text-xs text-destructive">{deleteErrors.email}</p>
                                                )}
                                            </div>

                                            <div className="space-y-1.5">
                                                <Label htmlFor="delete-password-confirm" className="text-xs">
                                                    Enter your password
                                                </Label>
                                                <Input
                                                    id="delete-password-confirm"
                                                    type="password"
                                                    value={deletePassword}
                                                    onChange={(e) => {
                                                        setDeletePassword(e.target.value);
                                                        if (deleteErrors.password) {
                                                            setDeleteErrors((prev) => ({ ...prev, password: '' }));
                                                        }
                                                    }}
                                                    placeholder="Current password"
                                                    required
                                                    className={cn(deleteErrors.password && 'border-destructive focus-visible:ring-destructive')}
                                                />
                                                {deleteErrors.password && (
                                                    <p className="text-xs text-destructive">{deleteErrors.password}</p>
                                                )}
                                            </div>
                                        </div>

                                        <AlertDialogFooter>
                                            <AlertDialogCancel type="button" disabled={isDeletingAccount}>
                                                Cancel
                                            </AlertDialogCancel>
                                            <Button
                                                type="submit"
                                                variant="destructive"
                                                disabled={
                                                    isDeletingAccount ||
                                                    deleteEmail.trim().toLowerCase() !== user.email.toLowerCase() ||
                                                    !deletePassword
                                                }
                                            >
                                                {isDeletingAccount && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                                                Delete account
                                            </Button>
                                        </AlertDialogFooter>
                                    </form>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
