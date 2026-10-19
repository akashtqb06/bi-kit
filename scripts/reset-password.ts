import readline from 'node:readline';
import { eq } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { users, sessions } from '@src/lib/db/schema';
import { hashPassword } from '@src/lib/auth/password';

async function promptQuestion(promptText: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(promptText, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

export async function resetUserPassword(emailArg?: string, passwordArg?: string): Promise<void> {
    const email = (emailArg || (await promptQuestion('Enter user email: '))).trim().toLowerCase();

    if (!email) {
        console.error('Error: Email address is required.');
        process.exit(1);
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
        console.error(`Error: User with email "${email}" not found.`);
        process.exit(1);
    }

    let password = passwordArg;
    if (!password) {
        password = await promptQuestion('Enter new password (min 8 chars): ');
        if (!password) {
            console.error('Error: Password cannot be empty.');
            process.exit(1);
        }
        const confirm = await promptQuestion('Confirm new password: ');
        if (password !== confirm) {
            console.error('Error: Passwords do not match.');
            process.exit(1);
        }
    }

    if (password.length < 8) {
        console.error('Error: Password must be at least 8 characters long.');
        process.exit(1);
    }

    const newHash = await hashPassword(password);

    await db
        .update(users)
        .set({
            passwordHash: newHash,
            updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

    const revokedSessions = await db
        .delete(sessions)
        .where(eq(sessions.userId, user.id))
        .returning();

    console.log(`\nPassword reset successfully for ${user.email} (${user.name}, role: ${user.role}).`);
    console.log(`Revoked ${revokedSessions.length} active session(s).`);
}

// Direct CLI invocation
if (process.argv[1]?.endsWith('reset-password.ts')) {
    const email = process.argv[2];
    const password = process.argv[3];
    resetUserPassword(email, password)
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('Failed to reset password:', err);
            process.exit(1);
        });
}

