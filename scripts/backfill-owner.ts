import { eq, sql } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { users, dataSources, workbooks, dashboards, queries, charts } from '@src/lib/db/schema';
import { hashPassword } from '@src/lib/auth/password';
import { newId } from '@src/lib/db/id';

async function backfillOwner(): Promise<void> {
    console.log('Starting backfill for resource owners...');

    // 1. Find or create first admin
    let admin = db.select().from(users).where(eq(users.role, 'admin')).get();

    if (!admin) {
        const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
        const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
        if (process.env.NODE_ENV === 'production' && password === 'ChangeMe123!') {
            throw new Error('Refusing to create admin with default password in production.');
        }

        const passwordHash = await hashPassword(password);
        const adminId = newId();
        db.insert(users)
            .values({
                id: adminId,
                email: email.toLowerCase().trim(),
                name: 'Admin User',
                passwordHash,
                role: 'admin',
                status: 'active',
            })
            .run();
        admin = db.select().from(users).where(eq(users.id, adminId)).get();
        console.log(`Created default admin user: ${email} (${adminId})`);
    } else {
        console.log(`Found existing admin user: ${admin.email} (${admin.id})`);
    }

    if (!admin) {
        throw new Error('Failed to identify or create an admin user for backfilling.');
    }

    const adminId = admin.id;

    // 2. Backfill dataSources
    const dsRes = db.run(
        sql`UPDATE data_sources SET owner_id = ${adminId} WHERE owner_id IS NULL`
    );
    console.log(`Updated ${dsRes.changes} data source(s) with ownerId.`);

    // 3. Backfill workbooks
    const wbRes = db.run(
        sql`UPDATE workbooks SET owner_id = ${adminId} WHERE owner_id IS NULL`
    );
    console.log(`Updated ${wbRes.changes} workbook(s) with ownerId.`);

    // 4. Backfill dashboards: default to workbook's owner, or admin
    const dbRes = db.run(
        sql`UPDATE dashboards SET owner_id = COALESCE(
            (SELECT owner_id FROM workbooks WHERE workbooks.id = dashboards.workbook_id),
            ${adminId}
        ) WHERE owner_id IS NULL`
    );
    console.log(`Updated ${dbRes.changes} dashboard(s) with ownerId.`);

    // 5. Backfill createdBy on queries and charts
    const qRes = db.run(
        sql`UPDATE queries SET created_by = COALESCE(
            (SELECT owner_id FROM workbooks WHERE workbooks.id = queries.workbook_id),
            ${adminId}
        ) WHERE created_by IS NULL`
    );
    console.log(`Updated ${qRes.changes} query/queries with createdBy.`);

    const chRes = db.run(
        sql`UPDATE charts SET created_by = COALESCE(
            (SELECT owner_id FROM workbooks WHERE workbooks.id = charts.workbook_id),
            ${adminId}
        ) WHERE created_by IS NULL`
    );
    console.log(`Updated ${chRes.changes} chart(s) with createdBy.`);

    console.log('Backfill completed successfully.');
}

backfillOwner().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
});

