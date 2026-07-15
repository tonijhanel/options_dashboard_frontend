/**
 * api/auth-logout.js
 * -------------------
 * Clears the auth_token cookie by setting Max-Age=0, immediately
 * expiring it. No JWT verification needed here - logging out doesn't
 * require you to prove you were logged in.
 */
export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.setHeader('Set-Cookie', 'auth_token=; Path=/; Max-Age=0');
  res.status(200).json({ status: 'success' });
}