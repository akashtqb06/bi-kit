import { requireUser } from '@src/lib/auth/dal';
import { getSession, listSessions } from '@src/lib/auth/session';
import { SessionsView } from '@src/components/settings/sessions-view';

export default async function SettingsSessionsPage() {
    const user = await requireUser('/settings/sessions');
    const sessionCtx = await getSession();
    const userSessions = await listSessions(user.id);

    const currentId = sessionCtx?.session.id ?? null;

    // Sort: current session first, then descending by lastUsedAt
    userSessions.sort((a, b) => {
        if (a.id === currentId) return -1;
        if (b.id === currentId) return 1;
        return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
    });

    return <SessionsView sessions={userSessions} currentSessionId={currentId} />;
}
