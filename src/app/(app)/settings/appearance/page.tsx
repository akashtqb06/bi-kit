import { requireUser } from '@src/lib/auth/dal';
import { AppearanceForm } from '@src/components/settings/appearance-form';

export default async function SettingsAppearancePage() {
    await requireUser('/settings/appearance');

    return <AppearanceForm />;
}
