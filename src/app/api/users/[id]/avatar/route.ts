import fs from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@src/lib/auth/dal';
import { getAvatarFilePath } from '@src/lib/auth/user-service';

const MIME_MAP: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
};

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const avatar = await getAvatarFilePath(id);
    if (!avatar) {
        return NextResponse.json({ error: 'Avatar not found' }, { status: 404 });
    }

    try {
        const fileBuffer = await fs.readFile(avatar.filePath);
        const contentType = MIME_MAP[avatar.ext.toLowerCase()] || 'application/octet-stream';

        return new Response(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
            },
        });
    } catch {
        return NextResponse.json({ error: 'Failed to read avatar' }, { status: 500 });
    }
}
