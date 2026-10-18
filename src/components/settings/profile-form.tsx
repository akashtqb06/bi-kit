'use client';

import React, { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    BookOpenIcon,
    DatabaseIcon,
    LayoutDashboardIcon,
    Loader2Icon,
    UploadIcon,
    Trash2Icon,
    InfoIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { updateProfileAction, uploadAvatarAction } from '@src/lib/auth/settings-actions';
import type { SafeUser } from '@src/lib/auth/types';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from 'cn';

export function getAvatarColor(id: string): string {
    const colors = [
        'bg-blue-600 text-white',
        'bg-indigo-600 text-white',
        'bg-violet-600 text-white',
        'bg-purple-600 text-white',
        'bg-pink-600 text-white',
        'bg-rose-600 text-white',
        'bg-amber-600 text-white',
        'bg-emerald-600 text-white',
        'bg-teal-600 text-white',
        'bg-cyan-600 text-white',
    ];
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
        hash |= 0;
    }
    return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
    return (
        name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? '')
            .join('') || 'U'
    );
}

function formatDate(date: Date | string | null): string {
    if (!date) return '—';
    try {
        return format(new Date(date), 'MMMM d, yyyy');
    } catch {
        return '—';
    }
}

function formatRelative(date: Date | string | null): string {
    if (!date) return 'Never';
    try {
        return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
        return 'Recently';
    }
}

interface ProfileFormProps {
    user: SafeUser;
    activity: {
        workbooks: number;
        dataSources: number;
        dashboards: number;
    };
}

export function ProfileForm({ user, activity }: ProfileFormProps) {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState(user.name);
    const [nameError, setNameError] = useState<string | null>(null);
    const [isSavingProfile, startProfileTransition] = useTransition();
    const [isAvatarAction, startAvatarTransition] = useTransition();

    const handleSaveProfile = (e: React.FormEvent) => {
        e.preventDefault();
        setNameError(null);

        if (name.trim().length < 2 || name.trim().length > 60) {
            setNameError('Name must be between 2 and 60 characters');
            return;
        }

        const formData = new FormData();
        formData.append('name', name.trim());

        startProfileTransition(async () => {
            const res = await updateProfileAction({ ok: false }, formData);
            if (res.ok) {
                toast.success('Profile updated');
                router.refresh();
            } else {
                if (res.fieldErrors?.name) {
                    setNameError(res.fieldErrors.name);
                }
                toast.error(res.formError || res.fieldErrors?.name || 'Failed to update profile');
            }
        });
    };

    const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 1024 * 1024) {
            toast.error('Avatar file size must be less than 1 MB');
            return;
        }

        const formData = new FormData();
        formData.append('avatar', file);

        startAvatarTransition(async () => {
            const res = await uploadAvatarAction({ ok: false }, formData);
            if (res.ok) {
                toast.success('Avatar updated');
                router.refresh();
            } else {
                toast.error(res.formError || 'Failed to upload avatar');
            }
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        });
    };

    const handleRemoveAvatar = () => {
        const formData = new FormData();
        formData.append('remove', 'true');

        startAvatarTransition(async () => {
            const res = await uploadAvatarAction({ ok: false }, formData);
            if (res.ok) {
                toast.success('Avatar removed');
                router.refresh();
            } else {
                toast.error(res.formError || 'Failed to remove avatar');
            }
        });
    };

    return (
        <TooltipProvider>
            <div className="space-y-6">
                {/* Header Card */}
                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle>Profile</CardTitle>
                        <CardDescription>Your personal account details and platform identity.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                            <Avatar className="size-20 shrink-0 ring-2 ring-border shadow-xs">
                                <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
                                <AvatarFallback className={cn('text-2xl font-bold', getAvatarColor(user.id))}>
                                    {getInitials(user.name)}
                                </AvatarFallback>
                            </Avatar>

                            <div className="space-y-1.5 min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-xl font-semibold tracking-tight truncate">{user.name}</h3>
                                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                        {user.role === 'admin' ? 'Admin' : 'Member'}
                                    </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                                    <span>Member since {formatDate(user.createdAt)}</span>
                                    <span>•</span>
                                    <span>Last login {formatRelative(user.lastLoginAt)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Avatar actions */}
                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={handleAvatarFileChange}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isAvatarAction}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {isAvatarAction ? (
                                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                                ) : (
                                    <UploadIcon className="mr-2 size-4" />
                                )}
                                Upload avatar
                            </Button>

                            {user.avatarUrl && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-destructive"
                                    disabled={isAvatarAction}
                                    onClick={handleRemoveAvatar}
                                >
                                    <Trash2Icon className="mr-2 size-4" />
                                    Remove avatar
                                </Button>
                            )}

                            <span className="text-xs text-muted-foreground">
                                PNG, JPG, or WebP. Max 1 MB.
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Edit Form Card */}
                <Card>
                    <form onSubmit={handleSaveProfile}>
                        <CardHeader>
                            <CardTitle>Account Details</CardTitle>
                            <CardDescription>Update your public display name and credentials.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="profile-name">
                                    Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="profile-name"
                                    name="name"
                                    value={name}
                                    onChange={(e) => {
                                        setName(e.target.value);
                                        if (nameError) setNameError(null);
                                    }}
                                    placeholder="Your name"
                                    maxLength={60}
                                    required
                                    className={cn(nameError && 'border-destructive focus-visible:ring-destructive')}
                                />
                                {nameError ? (
                                    <p className="text-xs text-destructive">{nameError}</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">Between 2 and 60 characters.</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5">
                                    <Label htmlFor="profile-email">Email</Label>
                                    <Tooltip>
                                        <TooltipTrigger render={<button type="button" className="text-muted-foreground hover:text-foreground cursor-help" />}>
                                            <InfoIcon className="size-3.5" />
                                            <span className="sr-only">Email change info</span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Contact an admin to change your email</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                                <Input
                                    id="profile-email"
                                    name="email"
                                    type="email"
                                    value={user.email}
                                    readOnly
                                    disabled
                                    className="bg-muted cursor-not-allowed text-muted-foreground"
                                />
                                {/* TODO: Implement email change with password confirmation and verification token */}
                                <p className="text-xs text-muted-foreground">
                                    Email is managed by administrator policy.
                                </p>
                            </div>
                        </CardContent>
                        <CardFooter className="border-t pt-4 flex justify-end">
                            <Button type="submit" disabled={isSavingProfile || name.trim() === user.name}>
                                {isSavingProfile && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                                Save changes
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                {/* Activity Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>Your Activity</CardTitle>
                        <CardDescription>Overview of workspace items in your environment.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="flex items-center gap-3 rounded-lg border p-4 bg-card shadow-2xs">
                                <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                                    <BookOpenIcon className="size-5" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold tracking-tight">{activity.workbooks}</p>
                                    <p className="text-xs text-muted-foreground">Workbooks</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 rounded-lg border p-4 bg-card shadow-2xs">
                                <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                                    <DatabaseIcon className="size-5" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold tracking-tight">{activity.dataSources}</p>
                                    <p className="text-xs text-muted-foreground">Data Sources</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 rounded-lg border p-4 bg-card shadow-2xs">
                                <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                                    <LayoutDashboardIcon className="size-5" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold tracking-tight">{activity.dashboards}</p>
                                    <p className="text-xs text-muted-foreground">Dashboards</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </TooltipProvider>
    );
}
