import assert from 'node:assert/strict';
import { test } from 'node:test';
import process from 'node:process';
import proxy from '../api/proxy.js';

function response() {
  return {
    headers: {}, code: null, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
}

test('same-origin proxy forwards the session and rewritten route without leaking other cookies', async (t) => {
  t.mock.property(process, 'env', { ...process.env, VERCEL_ENV: 'production', API_PROXY_TARGET: 'https://fionemr-backend.vercel.app' });
  let upstream;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    upstream = { url: String(url), ...options };
    return new Response('{"data":{}}', { headers: { 'Content-Type': 'application/json', 'Set-Cookie': '__Host-fione_session=test; Path=/; Secure; HttpOnly; SameSite=Lax' } });
  });
  const res = response();
  await proxy({ method: 'POST', url: '/api/auth/login?route=auth/login', query: { route: 'auth/login' }, headers: { origin: 'https://fionemr-frontend.vercel.app', cookie: 'analytics=private; __Host-fione_session=existing' }, body: { cookieSession: true } }, res);
  assert.equal(upstream.url, 'https://fionemr-backend.vercel.app/api/auth/login');
  assert.equal(upstream.headers.cookie, '__Host-fione_session=existing');
  assert.equal(upstream.headers.origin, 'https://fionemr-frontend.vercel.app');
  assert.equal(upstream.body, '{"cookieSession":true}');
  assert.equal(res.code, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.match(res.headers['set-cookie'][0], /HttpOnly/);
});

test('proxy rejects Preview using the Production alias', async (t) => {
  t.mock.property(process, 'env', { ...process.env, VERCEL_ENV: 'preview', API_PROXY_TARGET: 'https://fionemr-backend.vercel.app' });
  const res = response();
  await proxy({ method: 'GET', url: '/api/health', headers: {} }, res);
  assert.equal(res.code, 503);
});

test('proxy preserves query parameters and propagates backend failures', async (t) => {
  t.mock.property(process, 'env', { ...process.env, VERCEL_ENV: 'production', API_PROXY_TARGET: 'https://fionemr-backend.vercel.app' });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://fionemr-backend.vercel.app/api/patients/1001?refresh=true');
    assert.equal(options.body, undefined);
    return new Response('{"error":"Authentication required."}', { status: 401, headers: { 'Content-Type': 'application/json' } });
  });
  const res = response();
  await proxy({ method: 'GET', url: '/api/patients/1001?refresh=true', headers: {} }, res);
  assert.equal(res.code, 401);
  assert.match(res.body.toString(), /Authentication required/);
});

test('proxy rejects traversal and returns a controlled network error', async (t) => {
  t.mock.property(process, 'env', { ...process.env, VERCEL_ENV: 'production', API_PROXY_TARGET: 'https://fionemr-backend.vercel.app' });
  const invalid = response();
  await proxy({ method: 'GET', url: '/api/proxy?route=..%2Fhealth', headers: {} }, invalid);
  assert.equal(invalid.code, 400);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('private network details'); });
  const offline = response();
  await proxy({ method: 'GET', url: '/api/health', headers: {} }, offline);
  assert.equal(offline.code, 502);
  assert.doesNotMatch(JSON.stringify(offline.body), /private/);
});
