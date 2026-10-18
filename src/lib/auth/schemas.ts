import { z } from 'zod';

export const normalizedEmailSchema = z.string().trim().toLowerCase().email();
export const passwordSchema = z.string().min(8).max(128);

export const credentialsSchema = z
    .object({
        email: normalizedEmailSchema,
        password: passwordSchema,
    })
    .refine(({ email, password }) => password.toLowerCase() !== email, {
        message: 'Password must not match the email address',
        path: ['password'],
    });

export const registerSchema = z
    .object({
        name: z.string().trim().min(1, 'Name is required').max(100),
        email: normalizedEmailSchema,
        password: passwordSchema,
        confirmPassword: z.string(),
    })
    .refine(({ email, password }) => password.toLowerCase() !== email, {
        message: 'Password must not match the email address',
        path: ['password'],
    })
    .refine(({ password, confirmPassword }) => password === confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    });

export const safeUserSchema = z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    role: z.string(),
    avatarUrl: z.string().nullable(),
    createdAt: z.coerce.date(),
    lastLoginAt: z.coerce.date().nullable().default(null),
});

export const updateProfileSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, 'Name must be at least 2 characters')
        .max(60, 'Name must be at most 60 characters'),
});

export const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: passwordSchema,
        confirmPassword: z.string().min(1, 'Please confirm your new password'),
    })
    .refine(({ currentPassword, newPassword }) => currentPassword !== newPassword, {
        message: 'New password must be different from current password',
        path: ['newPassword'],
    })
    .refine(({ newPassword, confirmPassword }) => newPassword === confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    });

export const deleteAccountSchema = z.object({
    email: normalizedEmailSchema,
    password: z.string().min(1, 'Password is required'),
});
