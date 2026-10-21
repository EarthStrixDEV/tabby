// Same-origin JSON API client. fetch and the token source are injected for testability.

export class ApiError extends Error {
  constructor(kind, status, message, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    if (extra.fields !== undefined) this.fields = extra.fields;
    if (extra.retryAfter !== undefined) this.retryAfter = extra.retryAfter;
    if (extra.cause !== undefined) this.cause = extra.cause;
  }
}

// Endpoints guarded by X-Test-Token (Spec §5); query string is ignored.
export function needsToken(method, path) {
  const m = String(method).toUpperCase();
  const p = String(path).split(/[?#]/)[0];
  if (m === 'GET') return p.startsWith('/download/') || p === '/api/slow';
  if (m === 'POST') return p === '/upload' || p === '/api/seed';
  if (m === 'DELETE') return p === '/api/seed' || p === '/api/cache';
  return false;
}

const KIND_BY_STATUS = { 400: 'bad_request', 403: 'forbidden', 404: 'not_found', 413: 'too_large', 422: 'validation', 429: 'rate_limited' };

export function kindFor(status) {
  return KIND_BY_STATUS[status] ?? (status >= 500 ? 'server' : 'bad_request');
}

async function readBody(res, lenient) {
  const type = res.headers.get('content-type') ?? '';
  // Error bodies are always attempted; success bodies only when textual (downloads are binary).
  if (!lenient && !/json|^text\//i.test(type)) return null;
  try {
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

export function createApi({ fetchImpl = (...args) => globalThis.fetch(...args), getToken = () => '' } = {}) {
  async function request(method, path, { json, body, signal } = {}) {
    const headers = {};
    let payload;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(json);
    } else if (body !== undefined) {
      payload = body; // FormData etc.: the browser sets the multipart Content-Type
    }
    if (needsToken(method, path)) {
      const token = getToken();
      if (token) headers['X-Test-Token'] = token;
    }

    let res;
    try {
      res = await fetchImpl(path, { method, headers, body: payload, signal, credentials: 'same-origin' });
    } catch (cause) {
      throw new ApiError('network', 0, 'network_error', { cause });
    }

    if (res.ok) {
      const data = res.status === 204 ? null : await readBody(res, false);
      return { status: res.status, data, headers: res.headers };
    }

    const err = await readBody(res, true);
    const message = (err && typeof err.error === 'string' && err.error) || `HTTP ${res.status}`;
    const kind = kindFor(res.status);
    const extra = {};
    if (kind === 'validation') extra.fields = err?.fields ?? {};
    if (kind === 'rate_limited' && err && err.retry_after != null) extra.retryAfter = Number(err.retry_after);
    throw new ApiError(kind, res.status, message, extra);
  }

  return { request };
}
