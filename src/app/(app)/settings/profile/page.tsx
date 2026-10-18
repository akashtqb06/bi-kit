import { requireUser } from '@src/lib/auth/dal';
import { getUserActivityCounts } from '@src/lib/auth/user-service';
import { ProfileForm } from '@src/components/settings/profile-form';

export default async function SettingsProfilePage() {
    const user = await requireUser('/settings/profile');
    const activity = await getUserActivityCounts(user.id);

    return <ProfileForm user={user} activity={activity} />;
}
