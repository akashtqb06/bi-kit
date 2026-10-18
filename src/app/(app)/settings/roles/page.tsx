import { requireRole } from '@src/lib/auth/dal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRoundIcon } from 'lucide-react';

export default async function AdminRolesPage() {
    await requireRole('admin', { next: '/settings/roles' });

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <KeyRoundIcon className="size-5 text-muted-foreground" />
                        <CardTitle>Roles & Permissions</CardTitle>
                    </div>
                    <CardDescription>
                        Configure roles, fine-grained resource permissions, and access policies.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-4 mb-3">
                        <KeyRoundIcon className="size-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-medium">Coming soon</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mt-1">
                        Granular role-based access control, sharing rules, and dataset policies will be available in an upcoming release.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
