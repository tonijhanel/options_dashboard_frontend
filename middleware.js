/**
 * middleware.js
 * ---------------
 * Simple password gate for the whole site, using Vercel's free-tier
 * Routing Middleware feature (works with any framework, not just
 * Next.js) to implement HTTP Basic Auth by hand. Vercel's own built-in
 * "Password Protection" requires a Pro plan - this achieves the same
 * practical result (a username/password prompt before anything loads)
 * without needing to upgrade.
 *
 * Runs on EVERY request, including /api/* - this is deliberate, not an
 * oversight. Once a browser successfully authenticates via a Basic Auth
 * challenge, it automatically re-sends the same credentials on every
 * later same-origin request for the rest of the session, including the
 * app's own fetch() calls to /api/positions etc. So the frontend's API
 * client needs zero changes - the browser handles re-sending the
 * credential on its own.
 *
 * Required Vercel environment variables (Settings -> Environment
 * Variables, same place as RAILWAY_API_URL/RAILWAY_API_KEY):
 *   BASIC_AUTH_USER
 *   BASIC_AUTH_PASSWORD
 */

export const config = {
  matcher: '/((?!_vercel).*)',
};

export default function middleware(request) {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD;

  // Fail safe, not open: if the env vars aren't set, block everything
  // with a clear message rather than silently leaving the site
  // unprotected because of a missing config value.
  if (!expectedUser || !expectedPassword) {
    return new Response('BASIC_AUTH_USER/BASIC_AUTH_PASSWORD not configured on this deployment.', {
      status: 500,
    });
  }

  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded);
      const separatorIndex = decoded.indexOf(':');
      const user = decoded.slice(0, separatorIndex);
      const password = decoded.slice(separatorIndex + 1);

      if (user === expectedUser && password === expectedPassword) {
        return; // credentials correct - let the request through
      }
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Options Dashboard"',
    },
  });
}