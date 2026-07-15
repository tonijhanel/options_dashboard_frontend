/**
 * middleware.js
 * ---------------
 * Replaces the old browser-native Basic Auth popup with a real login
 * page. This is plain Vercel Edge Middleware (NOT Next.js) - same as
 * the Basic Auth version this replaces - so this uses only standard Web
 * APIs (Request/Response/URL, manual cookie parsing), not Next.js
 * conveniences like NextResponse or request.cookies, which don't exist
 * in this project at all.
 *
 * Uses `jose` for JWT verification rather than `jsonwebtoken`: this runs
 * in Vercel's Edge Runtime, which does NOT support Node's `crypto`
 * module that jsonwebtoken depends on - it throws a hard runtime error
 * ("The Edge Runtime does not support Node.js 'crypto' module"). jose
 * uses the Web Crypto API instead, which IS available here.
 *
 * Checks for a valid signed JWT in the `auth_token` cookie on every
 * request. No valid cookie -> redirect to /login.html. This protects
 * everything, including the /api/* proxy routes - not just page
 * navigation - since without this, someone could hit /api/positions
 * directly and get real data back without ever logging in at all.
 *
 * Required Vercel environment variable: JWT_SECRET (a long random
 * string - used to sign AND verify tokens, must match what
 * api/auth-login.js uses to sign them).
 */

import { jwtVerify } from 'jose';

export const config = {
  matcher: '/((?!_vercel).*)',
};

const PUBLIC_PATHS = ['/login.html', '/api/auth-login', '/api/auth-logout'];

function isPublicPath(pathname) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Vite's built asset files (JS/CSS bundles, fonts) need to load on the
  // login page itself too, even though login.html is a plain static
  // file rather than the React app.
  if (pathname.startsWith('/assets/')) return true;
  return false;
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url);

  if (isPublicPath(pathname)) {
    return; // let the request through unmodified
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return new Response('JWT_SECRET not configured on this deployment.', { status: 500 });
  }

  const token = getCookie(request, 'auth_token');
  const loginUrl = new URL('/login.html', request.url);

  if (!token) {
    return Response.redirect(loginUrl, 302);
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(jwtSecret));
    return; // valid token - let the request through
  } catch {
    // Covers a missing/tampered/expired/wrong-secret token uniformly -
    // any verification failure sends you back to the login page, and
    // clears the bad cookie so it doesn't just keep failing silently.
    //
    // Response.redirect() produces a Response with IMMUTABLE headers by
    // spec - trying to .append() a Set-Cookie onto it afterward throws
    // "TypeError: immutable". Constructing the Response manually instead
    // allows both Location and Set-Cookie to be set together from the start.
    return new Response(null, {
      status: 302,
      headers: {
        Location: loginUrl.toString(),
        'Set-Cookie': 'auth_token=; Path=/; Max-Age=0',
      },
    });
  }
}