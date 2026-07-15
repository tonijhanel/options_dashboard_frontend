import { SignJWT } from 'jose';

/**
 * api/auth-login.js
 * -------------------
 * Checks the submitted username/password against LOGIN_USERNAME/
 * LOGIN_PASSWORD env vars. On success, signs a JWT and sets it as an
 * HttpOnly cookie - HttpOnly means client-side JavaScript can never
 * read this cookie at all, which is real protection against token
 * theft via XSS, unlike storing a token in localStorage (readable by
 * any script that runs on the page).
 *
 * Uses `jose` (not `jsonwebtoken`) purely for consistency with
 * middleware.js, which MUST use jose since it runs in the Edge Runtime -
 * this function itself is a regular Node.js serverless function, so
 * jsonwebtoken would technically also work here, but using one library
 * everywhere avoids any confusion about which one is safe where.
 *
 * Required Vercel environment variables:
 *   LOGIN_USERNAME
 *   LOGIN_PASSWORD
 *   JWT_SECRET (a long random string - must match middleware.js's value)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const expectedUser = process.env.LOGIN_USERNAME;
  const expectedPassword = process.env.LOGIN_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;

  if (!expectedUser || !expectedPassword || !jwtSecret) {
    res.status(500).json({ error: 'LOGIN_USERNAME/LOGIN_PASSWORD/JWT_SECRET not configured on this deployment.' });
    return;
  }

  const { username, password } = req.body || {};

  if (username !== expectedUser || password !== expectedPassword) {
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  const token = await new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(new TextEncoder().encode(jwtSecret));

  const isProduction = process.env.NODE_ENV === 'production';
  const cookieParts = [
    `auth_token=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${60 * 60 * 24 * 7}`, // 7 days, matching the JWT's own expiration
  ];
  if (isProduction) cookieParts.push('Secure');

  res.setHeader('Set-Cookie', cookieParts.join('; '));
  res.status(200).json({ status: 'success' });
}