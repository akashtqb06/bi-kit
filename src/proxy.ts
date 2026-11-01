import { NextResponse, type NextRequest } from 'next/server';
import { validateRequestOrigin } from '@src/lib/security/origin';

export function proxy(request: NextRequest) {
    // CSRF / Origin verification on mutating requests
    const originCheck = validateRequestOrigin(request);
    if (!originCheck.ok) {
        return new NextResponse(`Forbidden: ${originCheck.reason}`, { status: 403 });
    }

    const { pathname, search } = request.nextUrl;
    const isPublicPage = pathname === '/login' || pathname === '/register';
    const isApi = pathname.startsWith('/api/') || pathname === '/api';
    const isNextAsset = pathname.startsWith('/_next/');
    const isStaticFile = /\.[^/]+$/.test(pathname);
    const isFavicon = pathname === '/favicon.ico';

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-pathname', pathname);

    if (isPublicPage || isApi || isNextAsset || isStaticFile || isFavicon) {
        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    }

    if (request.cookies.get('session')?.value) {
        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
}