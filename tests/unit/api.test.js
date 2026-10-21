import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsToken, createApi, ApiError } from '../../shared/public/static/js/lib/api.js';

test('needsToken follows the token-guarded endpoint list', () => {
  assert.equal(needsToken('DELETE', '/api/cache'), true);
  assert.equal(needsToken('GET', '/api/cache-stats'), false);
  assert.equal(needsToken('GET', '/api/slow?ms=200'), true);
  assert.equal(needsToken('GET', '/download/5'), true);
  assert.equal(needsToken('POST', '/upload'), true);
  assert.equal(needsToken('POST', '/api/seed'), true);
  assert.equal(needsToken('DELETE', '/api/seed'), true);
  assert.equal(needsToken('post', '/api/seed'), true);
  assert.equal(needsToken('GET', '/api/seed'), false);
  assert.equal(needsToken('GET', '/api/cache'), false);
  assert.equal(needsToken('GET', '/api/debts'), false);
  assert.equal(needsToken('GET', '/api/debts?x=/api/slow'), false);
});

const jsonRes = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function stub(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return response;
  };
  return { fetchImpl, calls };
}

test('2xx resolves with status, data, headers; same-origin credentials', async () => {
  const { fetchImpl, calls } = stub(jsonRes(200, { items: [1] }, { 'X-Stack': 'php' }));
  const r = await createApi({ fetchImpl }).request('GET', '/api/debts');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { items: [1] });
  assert.equal(r.headers.get('x-stack'), 'php');
  assert.equal(calls[0].url, '/api/debts');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.credentials, 'same-origin');
});

test('json body is serialized with Content-Type', async () => {
  const { fetchImpl, calls } = stub(jsonRes(201, { id: 1 }));
  await createApi({ fetchImpl }).request('POST', '/api/debts', { json: { amount: '1' } });
  assert.equal(calls[0].init.body, '{"amount":"1"}');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
});

test('FormData body passes through without Content-Type', async () => {
  const { fetchImpl, calls } = stub(jsonRes(200, {}));
  const fd = new FormData();
  fd.append('file', new Blob(['x']), 'x.bin');
  await createApi({ fetchImpl }).request('POST', '/upload', { body: fd });
  assert.equal(calls[0].init.body, fd);
  assert.equal(calls[0].init.headers['Content-Type'], undefined);
});

test('204 resolves with data null', async () => {
  const { fetchImpl } = stub(new Response(null, { status: 204 }));
  const r = await createApi({ fetchImpl }).request('DELETE', '/api/debts/1');
  assert.equal(r.status, 204);
  assert.equal(r.data, null);
});

test('X-Test-Token only when needed and present', async () => {
  const a = stub(jsonRes(200, {}));
  await createApi({ fetchImpl: a.fetchImpl, getToken: () => 'sekret' }).request('GET', '/api/slow?ms=1');
  assert.equal(a.calls[0].init.headers['X-Test-Token'], 'sekret');

  const b = stub(jsonRes(200, {}));
  await createApi({ fetchImpl: b.fetchImpl, getToken: () => 'sekret' }).request('GET', '/api/debts');
  assert.equal(b.calls[0].init.headers['X-Test-Token'], undefined);

  const c = stub(jsonRes(200, {}));
  await createApi({ fetchImpl: c.fetchImpl, getToken: () => '' }).request('GET', '/api/slow?ms=1');
  assert.equal(c.calls[0].init.headers['X-Test-Token'], undefined);
});

test('signal is forwarded', async () => {
  const { fetchImpl, calls } = stub(jsonRes(200, {}));
  const ac = new AbortController();
  await createApi({ fetchImpl }).request('GET', '/api/debts', { signal: ac.signal });
  assert.equal(calls[0].init.signal, ac.signal);
});

async function failure(status, body, headers) {
  const { fetchImpl } = stub(jsonRes(status, body, headers));
  try {
    await createApi({ fetchImpl }).request('POST', '/api/debts', { json: {} });
  } catch (e) {
    return e;
  }
  return assert.fail('expected rejection');
}

test('422 -> validation with fields', async () => {
  const e = await failure(422, { error: 'validation_failed', fields: { amount: 'ต้องมากกว่า 0' } });
  assert.ok(e instanceof ApiError);
  assert.ok(e instanceof Error);
  assert.equal(e.kind, 'validation');
  assert.equal(e.status, 422);
  assert.deepEqual(e.fields, { amount: 'ต้องมากกว่า 0' });
});

test('429 -> rate_limited with retryAfter from body', async () => {
  const e = await failure(429, { error: 'rate_limited', retry_after: 17 });
  assert.equal(e.kind, 'rate_limited');
  assert.equal(e.status, 429);
  assert.equal(e.retryAfter, 17);
});

test('other statuses map to kinds', async () => {
  for (const [status, kind] of [[400, 'bad_request'], [403, 'forbidden'], [404, 'not_found'], [413, 'too_large'], [500, 'server'], [503, 'server'], [405, 'bad_request']]) {
    const e = await failure(status, { error: 'x' });
    assert.equal(e.kind, kind, String(status));
    assert.equal(e.status, status);
  }
});

test('non-JSON error body still rejects with the right kind', async () => {
  const { fetchImpl } = stub(new Response('<html>oops</html>', { status: 500 }));
  await assert.rejects(createApi({ fetchImpl }).request('GET', '/api/debts'), (e) => e instanceof ApiError && e.kind === 'server' && e.status === 500);
});

test('thrown fetch -> network, status 0', async () => {
  const { fetchImpl } = stub(new TypeError('failed to fetch'));
  await assert.rejects(createApi({ fetchImpl }).request('GET', '/api/debts'), (e) => e instanceof ApiError && e.kind === 'network' && e.status === 0);
});

test('the token never appears in an error message', async () => {
  const { fetchImpl } = stub(new TypeError('boom'));
  const api = createApi({ fetchImpl, getToken: () => 'sekret-token' });
  await assert.rejects(api.request('GET', '/api/slow'), (e) => !e.message.includes('sekret-token'));
});
