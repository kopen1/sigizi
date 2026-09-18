import { Target } from '../lib/target.js';

const DEFAULT_FILTER = {
  prov: '33',
  kab: '3321',
  kec: '3321020',
  kode_pusk: 'P3321020101',
  pkm: '4636',
  kel: '3321020010',
  POSY: 'P3321020101265001',
  usia: '059'
};

const CONFIG_KEYS = ['prov', 'kab', 'kec', 'kode_pusk', 'pkm', 'kel', 'POSY', 'usia'];
const OPTIONS_TTL = 24 * 60 * 60;
const SESSION_TTL = 8 * 60 * 60;

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      headers || {}
    )
  });
}

function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

function basicAuth(request, env) {
  if (!env.APP_PASSWORD) return true;
  const user = env.APP_USER || 'sigizi';
  const header = request.headers.get('authorization') || '';
  if (header.indexOf('Basic ') === 0) {
    const decoded = atob(header.slice(6));
    const sep = decoded.indexOf(':');
    if (decoded.slice(0, sep) === user && decoded.slice(sep + 1) === env.APP_PASSWORD) return true;
  }
  return false;
}

function makeClient(session, env) {
  const client = new Target({ endpoint: env.SIGIZI_ENDPOINT || '' });
  client.importCookies(session.cookies || {});
  client.authenticated = Boolean(session.authed);
  client.profile = session.profile || null;
  return client;
}

function persistClient(session, client) {
  session.cookies = client.exportCookies();
  session.authed = client.authenticated;
  session.profile = client.profile;
}

function requireClient(session) {
  if (!session.authed) {
    const err = new Error('Belum login');
    err.status = 401;
    throw err;
  }
}

async function loadConfig(env) {
  const saved = (await env.SIGIZI_KV.get('config', 'json')) || {};
  const out = Object.assign({}, DEFAULT_FILTER);
  for (const key of CONFIG_KEYS) {
    if (saved[key]) out[key] = String(saved[key]);
  }
  return out;
}

async function optionsRequest(env, type, id, client) {
  const cacheKey = 'options:' + type + ':' + id;
  const cached = await env.SIGIZI_KV.get(cacheKey, 'json');
  if (cached) return { options: cached, cached: true };
  const map = {
    kab: '/ppgbm/index.php/Common/kab/?provinsi_id=' + encodeURIComponent(id),
    kec: '/ppgbm/index.php/Common/kec/?kabupaten_id=' + encodeURIComponent(id),
    pkm: '/ppgbm/index.php/Common/pkm/?kecamatan_id=' + encodeURIComponent(id) + '&type=KEC',
    kel: '/ppgbm/index.php/Common/kel/?puskesmas_id=' + encodeURIComponent(id) + '&type=PKM',
    posy: '/ppgbm/index.php/Common/posy/?desa_id=' + encodeURIComponent(id) + '&type=DESA'
  };
  if (!map[type]) return { error: 'type tidak dikenal', status: 400 };
  const result = await client.getText(map[type]);
  let parsed;
  try {
    parsed = JSON.parse(result.text);
  } catch (e) {
    return { error: 'Gagal membaca opsi dari server', status: 502 };
  }
  await env.SIGIZI_KV.put(cacheKey, JSON.stringify(parsed), { expirationTtl: OPTIONS_TTL });
  return { options: parsed, cached: false };
}

async function route(request, env, session, url) {
  const routePath = url.pathname;
  const method = request.method;

  if (routePath === '/api/session' && method === 'GET') {
    const config = await loadConfig(env);
    return json({
      authenticated: Boolean(session.authed),
      profile: session.profile || null,
      username: env.SIGIZI_USER || '',
      defaults: config
    });
  }

  if (routePath === '/api/config') {
    if (method === 'GET') {
      return json({ config: await loadConfig(env) });
    }
    if (method === 'POST') {
      requireClient(session);
      const body = await request.json().catch(function () { return {}; });
      const saved = (await env.SIGIZI_KV.get('config', 'json')) || {};
      for (const key of CONFIG_KEYS) {
        if (body[key] !== undefined) saved[key] = String(body[key]);
      }
      await env.SIGIZI_KV.put('config', JSON.stringify(saved));
      return json({ ok: true, config: await loadConfig(env) });
    }
  }

  if (routePath === '/api/captcha' && method === 'GET') {
    const client = new Target({ endpoint: env.SIGIZI_ENDPOINT || '' });
    const image = await client.getCaptcha();
    session.cookies = client.exportCookies();
    session.authed = false;
    session.profile = null;
    return json({ image: image });
  }

  if (routePath === '/api/login' && method === 'POST') {
    const body = await request.json().catch(function () { return {}; });
    const username = body.username || env.SIGIZI_USER || '';
    const password = body.password || env.SIGIZI_PASS || '';
    if (!username || !password) return json({ ok: false, error: 'Username/password belum diatur' }, 400);
    if (!body.captcha) return json({ ok: false, error: 'Captcha belum diisi' }, 400);
    const client = makeClient(session, env);
    if (!client.jar.header()) {
      const image = await client.getCaptcha();
      return json({ ok: false, error: 'Sesi captcha kedaluwarsa', _captcha: image }, 401);
    }
    const result = await client.login(username, password, body.captcha);
    persistClient(session, client);
    return json(result, result.ok ? 200 : 401);
  }

  if (routePath === '/api/logout' && method === 'POST') {
    session.cookies = {};
    session.authed = false;
    session.profile = null;
    return json({ ok: true });
  }

  if (routePath === '/api/options' && method === 'GET') {
    requireClient(session);
    const type = url.searchParams.get('type');
    const id = url.searchParams.get('id');
    if (!type || !id) return json({ error: 'type dan id wajib' }, 400);
    const client = makeClient(session, env);
    const result = await optionsRequest(env, type, id, client);
    persistClient(session, client);
    if (result.error) return json({ error: result.error }, result.status || 502);
    return json({ options: result.options, cached: Boolean(result.cached) });
  }

  if (routePath === '/api/balita' && method === 'GET') {
    requireClient(session);
    const client = makeClient(session, env);
    const f = await loadConfig(env);
    for (const key of ['prov', 'kab', 'kec', 'kode_pusk', 'pkm', 'kel', 'POSY', 'usia']) {
      const value = url.searchParams.get(key);
      if (value) f[key] = value;
    }
    f.bulan = url.searchParams.get('bulan') || '';
    f.tahun = url.searchParams.get('tahun') || '';
    const list = await client.getBalita(f);
    persistClient(session, client);
    const sudah = list.filter(function (c) { return c.status === 'sudah'; }).length;
    return json({ filter: f, total: list.length, sudah: sudah, belum: list.length - sudah, data: list });
  }

  const refMatch = routePath.match(/^\/api\/ref\/([^/]+)$/);
  if (refMatch && method === 'GET') {
    requireClient(session);
    const nik = decodeURIComponent(refMatch[1]);
    const refKey = 'ref:' + nik;
    const cached = await env.SIGIZI_KV.get(refKey, 'json');
    if (cached) return json({ history: cached, cached: true });
    const client = makeClient(session, env);
    const history = await client.getPerkembangan(nik);
    persistClient(session, client);
    await env.SIGIZI_KV.put(refKey, JSON.stringify(history), { expirationTtl: 120 });
    return json({ history: history });
  }

  const ukurMatch = routePath.match(/^\/api\/ukur\/([^/]+)$/);
  if (ukurMatch && method === 'GET') {
    requireClient(session);
    const nik = decodeURIComponent(ukurMatch[1]);
    const bulan = url.searchParams.get('bulan') || '';
    const tahun = url.searchParams.get('tahun') || '';
    const ukurKey = 'ukur:' + nik + ':' + bulan + ':' + tahun;
    const cached = await env.SIGIZI_KV.get(ukurKey, 'json');
    if (cached) return json(cached);
    const client = makeClient(session, env);
    const details = await client.getUkur(nik, bulan, tahun);
    persistClient(session, client);
    await env.SIGIZI_KV.put(ukurKey, JSON.stringify(details), { expirationTtl: 300 });
    return json(details);
  }

  if (routePath === '/api/ukur' && method === 'POST') {
    requireClient(session);
    const body = await request.json().catch(function () { return {}; });
    if (!body.nik || !body.values || !body.values.BERAT) {
      return json({ ok: false, error: 'NIK dan BB wajib diisi' }, 400);
    }
    const client = makeClient(session, env);
    const result = await client.saveUkur(body.nik, body.bulan, body.tahun, body.values);
    persistClient(session, client);
    await env.SIGIZI_KV.delete('ukur:' + body.nik + ':' + body.bulan + ':' + body.tahun);
    await env.SIGIZI_KV.delete('ref:' + body.nik);
    return json(result);
  }

  if (routePath === '/api/ukur/bulk' && method === 'POST') {
    requireClient(session);
    const body = await request.json().catch(function () { return {}; });
    const items = Array.isArray(body.items) ? body.items : [];
    const results = [];
    for (const item of items) {
      try {
        const client = makeClient(session, env);
        const result = await client.saveUkur(item.nik, body.bulan, body.tahun, item.values);
        persistClient(session, client);
        await env.SIGIZI_KV.delete('ukur:' + item.nik + ':' + body.bulan + ':' + body.tahun);
        await env.SIGIZI_KV.delete('ref:' + item.nik);
        results.push(Object.assign({ ok: true }, result));
      } catch (e) {
        results.push({ ok: false, nik: item.nik, error: e.message });
      }
    }
    const ok = results.filter(function (r) { return r.ok && r.verified; }).length;
    return json({ ok: ok, gagal: results.length - ok, results: results });
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    if (!basicAuth(request, env)) {
      return new Response('Perlu login aplikasi (APP_PASSWORD).', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Sigizi Simple"' }
      });
    }

    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Not found', { status: 404 });
    }

    let sid = getCookie(request, 'sid');
    let isNew = false;
    if (!sid) {
      sid = crypto.randomUUID();
      isNew = true;
    }
    let session = (await env.SIGIZI_KV.get('sess:' + sid, 'json')) || {};
    session.cookies = session.cookies || {};
    session.authed = Boolean(session.authed);
    session.profile = session.profile || null;

    let response;
    try {
      const handled = await route(request, env, session, url);
      response = handled || json({ error: 'Endpoint tidak ditemukan' }, 404);
    } catch (err) {
      response = json({ error: err.message || 'Terjadi kesalahan' }, err.status || 500);
    }

    ctx.waitUntil(
      env.SIGIZI_KV.put('sess:' + sid, JSON.stringify(session), { expirationTtl: SESSION_TTL })
    );
    if (isNew) {
      response.headers.append('Set-Cookie', 'sid=' + sid + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + SESSION_TTL);
    }
    return response;
  }
};
