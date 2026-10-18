'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeOffIcon, LoaderCircleIcon } from 'lucide-react';
import { registerAction } from '@src/lib/auth/actions';
import { registerSchema } from '@src/lib/auth/schemas';
import type { AuthActionResult } from '@src/lib/auth/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

type RegisterValues = { name: string; email: string; password: string; confirmPassword: string };
const initialState: AuthActionResult = { ok: false };

export function RegisterForm({ next }: { next: string }) {
    const [state, formAction, pending] = useActionState(registerAction, initialState);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const form = useForm<RegisterValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
        mode: 'onChange',
    });
    const password = useWatch({ control: form.control, name: 'password' }) ?? '';
    const hasMinimum = password.length >= 8;
    const underMaximum = password.length <= 128;

    return (
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle>Create your account</CardTitle>
                <CardDescription>Start organizing your data and dashboards.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form action={formAction} className="grid gap-4" noValidate>
                        <input type="hidden" name="next" value={next} />
                        {state.formError && (
                            <Alert variant="destructive">
                                <AlertTitle>Could not create account</AlertTitle>
                                <AlertDescription>{state.formError}</AlertDescription>
                            </Alert>
                        )}
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            autoComplete="name"
                                            placeholder="Your name"
                                            aria-invalid={Boolean(
                                                form.formState.errors.name || state.fieldErrors?.name
                                            )}
                                        />
                                    </FormControl>
                                    <FormMessage>{state.fieldErrors?.name}</FormMessage>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            type="email"
                                            autoComplete="email"
                                            placeholder="you@company.com"
                                            aria-invalid={Boolean(
                                                form.formState.errors.email || state.fieldErrors?.email
                                            )}
                                        />
                                    </FormControl>
                                    <FormMessage>{state.fieldErrors?.email}</FormMessage>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Password</FormLabel>
                                    <FormControl>
                                        <div className="relative">
                                            <Input
                                                {...field}
                                                type={showPassword ? 'text' : 'password'}
                                                autoComplete="new-password"
                                                className="pr-10"
                                                aria-invalid={Boolean(
                                                    form.formState.errors.password || state.fieldErrors?.password
                                                )}
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-0 top-0 size-8 text-muted-foreground"
                                                onClick={() => setShowPassword((visible) => !visible)}
                                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                            >
                                                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                                            </Button>
                                        </div>
                                    </FormControl>
                                    <p className="text-xs text-muted-foreground" aria-live="polite">
                                        {password.length === 0
                                            ? 'Use 8 to 128 characters.'
                                            : `${password.length}/8 minimum characters${!underMaximum ? ' · Maximum 128 exceeded' : hasMinimum ? ' · Minimum met' : ''}`}
                                    </p>
                                    <FormMessage>{state.fieldErrors?.password}</FormMessage>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="confirmPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Confirm password</FormLabel>
                                    <FormControl>
                                        <div className="relative">
                                            <Input
                                                {...field}
                                                type={showConfirmation ? 'text' : 'password'}
                                                autoComplete="new-password"
                                                className="pr-10"
                                                aria-invalid={Boolean(
                                                    form.formState.errors.confirmPassword ||
                                                    state.fieldErrors?.confirmPassword
                                                )}
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-0 top-0 size-8 text-muted-foreground"
                                                onClick={() => setShowConfirmation((visible) => !visible)}
                                                aria-label={
                                                    showConfirmation ? 'Hide confirmation' : 'Show confirmation'
                                                }
                                            >
                                                {showConfirmation ? <EyeOffIcon /> : <EyeIcon />}
                                            </Button>
                                        </div>
                                    </FormControl>
                                    <FormMessage>{state.fieldErrors?.confirmPassword}</FormMessage>
                                </FormItem>
                            )}
                        />
                        <Button type="submit" disabled={pending} className="w-full">
                            {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
                            {pending ? 'Creating account...' : 'Create account'}
                        </Button>
                        <Separator />
                        <p className="text-center text-sm text-muted-foreground">
                            Already have an account?{' '}
                            <Link
                                href={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
                                className="font-medium text-foreground underline-offset-4 hover:underline"
                            >
                                Sign in
                            </Link>
                        </p>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
