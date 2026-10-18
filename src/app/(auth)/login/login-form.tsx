'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeOffIcon, LoaderCircleIcon } from 'lucide-react';
import { loginAction } from '@src/lib/auth/actions';
import { credentialsSchema } from '@src/lib/auth/schemas';
import type { AuthActionResult } from '@src/lib/auth/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

type LoginValues = { email: string; password: string };
const initialState: AuthActionResult = { ok: false };

export function LoginForm({ next, allowRegistration }: { next: string; allowRegistration: boolean }) {
    const [state, formAction, pending] = useActionState(loginAction, initialState);
    const [showPassword, setShowPassword] = useState(false);
    const form = useForm<LoginValues>({
        resolver: zodResolver(credentialsSchema),
        defaultValues: { email: '', password: '' },
        mode: 'onChange',
    });
    const email = useWatch({ control: form.control, name: 'email' });
    const password = useWatch({ control: form.control, name: 'password' });
    const isRateLimited = state.formError?.startsWith('Too many login attempts') ?? false;
    const alertTitle = isRateLimited
        ? 'Please wait before trying again'
        : state.formError === 'This account is disabled'
          ? 'Account disabled'
          : 'Sign in failed';

    return (
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle>Welcome back</CardTitle>
                <CardDescription>Sign in to continue to BI Kit.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form action={formAction} className="grid gap-4" noValidate>
                        <input type="hidden" name="next" value={next} />
                        {state.formError && (
                            <Alert variant="destructive">
                                <AlertTitle>{alertTitle}</AlertTitle>
                                <AlertDescription>{state.formError}</AlertDescription>
                            </Alert>
                        )}
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
                                                autoComplete="current-password"
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
                                    <FormMessage>{state.fieldErrors?.password}</FormMessage>
                                </FormItem>
                            )}
                        />
                        <Button type="submit" disabled={pending || !email || !password} className="w-full">
                            {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
                            {pending ? 'Signing in...' : 'Sign in'}
                        </Button>
                        {allowRegistration && (
                            <>
                                <Separator />
                                <p className="text-center text-sm text-muted-foreground">
                                    New to BI Kit?{' '}
                                    <Link
                                        href={`/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
                                        className="font-medium text-foreground underline-offset-4 hover:underline"
                                    >
                                        Create an account
                                    </Link>
                                </p>
                            </>
                        )}
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
