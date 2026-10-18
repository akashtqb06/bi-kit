import { requireRole } from '@src/lib/auth/dal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UsersIcon } from 'lucide-react';

export default async function AdminUsersPage() {
    await requireRole('admin', { next: '/settings/users' });

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <UsersIcon className="size-5 text-muted-foreground" />
                        <CardTitle>Users</CardTitle>
                    </div>
                    <CardDescription>
                        Manage system users, invite team members, and manage access statuses.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-4 mb-3">
                        <UsersIcon className="size-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-medium">Coming soon</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mt-1">
                        User invitations, directory management, and status administration are currently under development.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
