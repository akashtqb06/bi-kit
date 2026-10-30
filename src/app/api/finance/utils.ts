import { NextResponse } from 'next/server';

/** Wraps data in a NextResponse with Cache-Control: no-store and no-cache */
export function jsonNoStore<T>(data: T, status = 200): NextResponse<T> {
  const response = NextResponse.json(data, { status });
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

