import { requireUser } from '@src/lib/auth/dal';
import { countActiveAdmins } from '@src/lib/auth/user-service';
import { SecurityForm } from '@src/components/settings/security-form';

export default async function SettingsSecurityPage() {
    const user = await requireUser('/settings/security');
    const adminCount = await countActiveAdmins();
    const isLastAdmin = user.role === 'admin' && adminCount <= 1;

    return <SecurityForm user={user} isLastAdmin={isLastAdmin} />;
}
