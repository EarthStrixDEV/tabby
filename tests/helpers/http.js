export const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8080';
export const TOKEN = process.env.TEST_TOKEN || 'local-test-token-0123456789abcdef';

export async function api(method, path, { json, headers = {}, body } = {}) {
  const init = { method, headers: { ...headers } };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers['Content-Type'] = 'application/json';
  } else if (body !== undefined) {
    init.body = body;
  }
  const res = await fetch(BASE_URL + path, init);
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, headers: res.headers, json: parsed, text };
}
