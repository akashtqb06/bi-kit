import { NextResponse } from 'next/server';

/** Wraps data in a NextResponse with Cache-Control: no-store */
export function jsonNoStore<T>(data: T, status = 200): NextResponse<T> {
  const response = NextResponse.json(data, { status });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
