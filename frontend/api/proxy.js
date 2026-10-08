// Keep the API cookie on the frontend origin, including on browsers that block
// third-party cookies. Preview must explicitly select a Preview backend.
import process from 'node:process';
import { Buffer } from 'node:buffer';

export default async function proxy(req, res) {
  const configured = process.env.API_PROXY_TARGET || process.env.VITE_API_URL;
  const production = process.env.VERCEL_ENV === 'production';
  const targetValue = configured || (production ? 'https://fionemr-backend.vercel.app/api' : '');
  if (!targetValue) return res.status(503).json({ error: 'Configure API_PROXY_TARGET for this deployment.' });
  let target;
  try {
    target = new URL(targetValue);
    if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash) throw new Error();
    if (!production && target.hostname === 'fionemr-backend.vercel.app') throw new Error();
  } catch { return res.status(503).json({ error: 'The API proxy target is not valid for this environment.' }); }

  const incoming = new URL(req.url, 'https://proxy.invalid');
  const route = req.query?.route || incoming.searchParams.get('route') || incoming.pathname.replace(/^\/api\//, '');
  incoming.searchParams.delete('route');
  if (typeof route !== 'string' || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(route) || route === 'proxy') return res.status(400).json({ error: 'Invalid API path.' });
  target.pathname = '/api/' + route;
  target.search = incoming.searchParams.toString();
  const headers = { 'Content-Type': 'application/json' };
  for (const name of ['origin', 'authorization', 'idempotency-key', 'x-account-id']) {
    if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
  }
  const sessionCookie = (req.headers.cookie || '').split(';').map((part) => part.trim()).filter((part) => /^(?:__Host-)?fione_session=/.test(part)).join('; ');
  if (sessionCookie) headers.cookie = sessionCookie;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(25000)
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    return res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
  } catch {
    return res.status(502).json({ error: 'The clinic API is temporarily unavailable. Please try again.' });
  }
}
