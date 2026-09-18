import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Target } from './lib/target.js';

function loadEnv(file) {
  const env = {};
  try {
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed[0] === '#') continue;
      const idx = trimmed.indexOf('=');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      env[key] = value;
    }
  } catch (e) {
    /* .env opsional */
  }
  return env;
}

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

const ENDPOINT = (process.env.SIGIZI_ENDPOINT || env.endpoint || '').replace(/\/+$/, '');
const USERNAME = process.env.SIGIZI_USER || env.username || '';
const PASSWORD = process.env.SIGIZI_PASS || env.password || '';

const APP_USER = process.env.APP_USER || 'sigizi';
const APP_PASSWORD = process.env.APP_PASSWORD || '';

function checkBasicAuth(req, res) {
  if (!APP_PASSWORD) return true;
  const header = req.headers.authorization || '';
  if (header.indexOf('Basic ') === 0) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const user = sep >= 0 ? decoded.slice(0, sep) : '';
    const pass = sep >= 0 ? decoded.slice(sep + 1) : '';
    if (user === APP_USER && pass === APP_PASSWORD) return true;
  }
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Sigizi Simple"',
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end('Perlu login aplikasi (APP_PASSWORD).');
  return false;
}

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

const CONFIG_FILE = path.join(ROOT, 'config.json');
const CONFIG_KEYS = ['prov', 'kab', 'kec', 'kode_pusk', 'pkm', 'kel', 'POSY', 'usia'];

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const out = {};
    for (const key of CONFIG_KEYS) {
      if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') out[key] = String(raw[key]);
    }
    return out;
  } catch (e) {
    return {};
  }
}

function effectiveDefaults() {
  return Object.assign({}, DEFAULT_FILTER, loadConfig());
}

const sessions = new Map();
const SESSION_FILE = path.join(ROOT, '.session.json');

const OPTIONS_CACHE_FILE = path.join(ROOT, '.cache-options.json');
const OPTIONS_TTL = 24 * 60 * 60 * 1000;
let optionsCache = loadOptionsCache();

function loadOptionsCache() {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(OPTIONS_CACHE_FILE, 'utf8'))));
  } catch (e) {
    return new Map();
  }
}

function saveOptionsCache() {
  try {
    fs.writeFileSync(OPTIONS_CACHE_FILE, JSON.stringify(Object.fromEntries(optionsCache)));
  } catch (e) {
    /* abaikan */
  }
}

const cacheStore = new Map();

function cacheGet(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (entry.expire && Date.now() > entry.expire) {
    cacheStore.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data, ttl) {
  cacheStore.set(key, { data: data, expire: ttl ? Date.now() + ttl : 0 });
}

function cacheClearPrefix(prefix) {
  for (const key of Array.from(cacheStore.keys())) {
    if (key.indexOf(prefix) === 0) cacheStore.delete(key);
  }
}

function loadPersisted() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

function savePersisted(session) {
  try {
    fs.writeFileSync(
      SESSION_FILE,
      JSON.stringify({
        cookies: session.client.exportCookies(),
        profile: session.client.profile,
        savedAt: Date.now()
      })
    );
  } catch (e) {
    /* gagal simpan tidak fatal */
  }
}

function clearPersisted() {
  try {
    fs.unlinkSync(SESSION_FILE);
  } catch (e) {
    /* tidak ada file */
  }
}

async function ensurePersisted(session) {
  if (session.client.authenticated || session.hydrated) return;
  session.hydrated = true;
  const data = loadPersisted();
  if (!data || !data.cookies || !Object.keys(data.cookies).length) return;
  await session.client.hydrate(data.cookies);
  if (session.client.authenticated && data.profile) session.client.profile = data.profile;
}

function getSession(req, res) {
  const cookieHeader = req.headers.cookie || '';
  let sid = null;
  for (const part of cookieHeader.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === 'sid') sid = v;
  }
  if (sid && sessions.has(sid)) return sessions.get(sid);
  sid = crypto.randomBytes(16).toString('hex');
  const session = {
    id: sid,
    created: Date.now(),
    client: new Target({ endpoint: ENDPOINT })
  };
  sessions.set(sid, session);
  res.setHeader(
    'Set-Cookie',
    'sid=' + sid + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800'
  );
  return session;
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let data = '';
    req.on('data', function (chunk) {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        reject(new Error('Payload terlalu besar'));
        req.destroy();
      }
    });
    req.on('end', function () {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('JSON tidak valid'));
      }
    });
    req.on('error', reject);
  });
}

function requireClient(session) {
  if (!session.client.authenticated) {
    const err = new Error('Belum login');
    err.status = 401;
    throw err;
  }
  return session.client;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.join(ROOT, 'public', path.normalize(rel).replace(/^(\.\.[\/\\])+/, ''));
  if (!filePath.startsWith(path.join(ROOT, 'public'))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Tidak ditemukan');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

async function handleApi(req, res, session, url) {
  const route = url.pathname;

  if (route !== '/api/captcha' && route !== '/api/login') {
    await ensurePersisted(session);
  }

  if (route === '/api/session' && req.method === 'GET') {
    return sendJson(res, 200, {
      authenticated: session.client.authenticated,
      profile: session.client.profile,
      username: USERNAME,
      defaults: effectiveDefaults()
    });
  }

  if (route === '/api/config') {
    if (req.method === 'GET') {
      return sendJson(res, 200, { config: effectiveDefaults() });
    }
    if (req.method === 'POST') {
      requireClient(session);
      const body = await readBody(req);
      const cfg = loadConfig();
      for (const key of CONFIG_KEYS) {
        if (body[key] !== undefined) cfg[key] = String(body[key]);
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
      return sendJson(res, 200, { ok: true, config: effectiveDefaults() });
    }
  }

  if (route === '/api/captcha' && req.method === 'GET') {
    const image = await session.client.getCaptcha();
    return sendJson(res, 200, { image: image });
  }

  if (route === '/api/login' && req.method === 'POST') {
    const body = await readBody(req);
    const username = body.username || USERNAME;
    const password = body.password || PASSWORD;
    const captcha = body.captcha || '';
    if (!username || !password) {
      return sendJson(res, 400, { ok: false, error: 'Username/password belum diisi di .env' });
    }
    if (!captcha) return sendJson(res, 400, { ok: false, error: 'Captcha belum diisi' });
    const result = await session.client.login(username, password, captcha);
    if (result.ok) savePersisted(session);
    return sendJson(res, result.ok ? 200 : 401, result);
  }

  if (route === '/api/logout' && req.method === 'POST') {
    clearPersisted();
    session.client = new Target({ endpoint: ENDPOINT });
    session.hydrated = true;
    return sendJson(res, 200, { ok: true });
  }

  if (route === '/api/options' && req.method === 'GET') {
    const client = requireClient(session);
    const type = url.searchParams.get('type');
    const id = url.searchParams.get('id');
    if (!type || !id) return sendJson(res, 400, { error: 'type dan id wajib' });
    const cacheKey = type + ':' + id;
    const hit = optionsCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < OPTIONS_TTL) {
      return sendJson(res, 200, { options: hit.data, cached: true });
    }
    const map = {
      kab: '/ppgbm/index.php/Common/kab/?provinsi_id=' + encodeURIComponent(id),
      kec: '/ppgbm/index.php/Common/kec/?kabupaten_id=' + encodeURIComponent(id),
      pkm: '/ppgbm/index.php/Common/pkm/?kecamatan_id=' + encodeURIComponent(id) + '&type=KEC',
      kel: '/ppgbm/index.php/Common/kel/?puskesmas_id=' + encodeURIComponent(id) + '&type=PKM',
      posy: '/ppgbm/index.php/Common/posy/?desa_id=' + encodeURIComponent(id) + '&type=DESA'
    };
    if (!map[type]) return sendJson(res, 400, { error: 'type tidak dikenal' });
    const result = await client.getText(map[type]);
    try {
      const parsed = JSON.parse(result.text);
      optionsCache.set(cacheKey, { data: parsed, ts: Date.now() });
      saveOptionsCache();
      return sendJson(res, 200, { options: parsed });
    } catch (e) {
      return sendJson(res, 502, { error: 'Gagal membaca opsi dari server' });
    }
  }

  if (route === '/api/balita' && req.method === 'GET') {
    const client = requireClient(session);
    const f = Object.assign({}, effectiveDefaults(), {
      bulan: url.searchParams.get('bulan') || '',
      tahun: url.searchParams.get('tahun') || ''
    });
    for (const key of ['prov', 'kab', 'kec', 'kode_pusk', 'pkm', 'kel', 'POSY', 'usia']) {
      const value = url.searchParams.get(key);
      if (value) f[key] = value;
    }
    const list = await client.getBalita(f);
    const sudah = list.filter(function (c) {
      return c.status === 'sudah';
    }).length;
    return sendJson(res, 200, { filter: f, total: list.length, sudah: sudah, belum: list.length - sudah, data: list });
  }

  const refMatch = route.match(/^\/api\/ref\/([^/]+)$/);
  if (refMatch && req.method === 'GET') {
    const client = requireClient(session);
    const nik = decodeURIComponent(refMatch[1]);
    const refKey = 'ref:' + nik;
    const refHit = cacheGet(refKey);
    if (refHit) return sendJson(res, 200, { history: refHit, cached: true });
    const history = await client.getPerkembangan(nik);
    cacheSet(refKey, history, 120000);
    return sendJson(res, 200, { history: history });
  }

  const ukurMatch = route.match(/^\/api\/ukur\/([^/]+)$/);
  if (ukurMatch && req.method === 'GET') {
    const client = requireClient(session);
    const nik = decodeURIComponent(ukurMatch[1]);
    const bulan = url.searchParams.get('bulan') || '';
    const tahun = url.searchParams.get('tahun') || '';
    const ukurKey = 'ukur:' + nik + ':' + bulan + ':' + tahun;
    const ukurHit = cacheGet(ukurKey);
    if (ukurHit) return sendJson(res, 200, ukurHit);
    const details = await client.getUkur(nik, bulan, tahun);
    cacheSet(ukurKey, details, 300000);
    return sendJson(res, 200, details);
  }

  if (route === '/api/ukur' && req.method === 'POST') {
    const client = requireClient(session);
    const body = await readBody(req);
    if (!body.nik || !body.values || !body.values.BERAT) {
      return sendJson(res, 400, { ok: false, error: 'NIK dan BB wajib diisi' });
    }
    const result = await client.saveUkur(body.nik, body.bulan, body.tahun, body.values);
    cacheClearPrefix('ukur:' + body.nik + ':');
    cacheClearPrefix('ref:' + body.nik + ':');
    return sendJson(res, 200, result);
  }

  if (route === '/api/ukur/bulk' && req.method === 'POST') {
    const client = requireClient(session);
    const body = await readBody(req);
    const items = Array.isArray(body.items) ? body.items : [];
    const results = [];
    for (const item of items) {
      try {
        const result = await client.saveUkur(item.nik, body.bulan, body.tahun, item.values);
        cacheClearPrefix('ukur:' + item.nik + ':');
        cacheClearPrefix('ref:' + item.nik + ':');
        results.push(Object.assign({ ok: true }, result));
      } catch (e) {
        results.push({ ok: false, nik: item.nik, error: e.message });
      }
    }
    const ok = results.filter(function (r) {
      return r.ok && r.verified;
    }).length;
    return sendJson(res, 200, { ok: ok, gagal: results.length - ok, results: results });
  }

  return sendJson(res, 404, { error: 'Endpoint tidak ditemukan' });
}

const server = http.createServer(function (req, res) {
  if (!checkBasicAuth(req, res)) return;
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (!ENDPOINT) {
    if (url.pathname.startsWith('/api/')) {
      return sendJson(res, 500, { error: 'endpoint belum diatur di .env' });
    }
  }
  if (!url.pathname.startsWith('/api/')) return serveStatic(res, url.pathname);

  const session = getSession(req, res);
  handleApi(req, res, session, url)
    .catch(function (err) {
      const status = err.status || 500;
      if (!res.headersSent) sendJson(res, status, { error: err.message || 'Terjadi kesalahan' });
    })
    .finally(function () {
      if (session.client && session.client.authenticated) savePersisted(session);
    });
});

server.listen(PORT, HOST, function () {
  console.log('Sigizi Simple berjalan di http://' + HOST + ':' + PORT);
  console.log('Target: ' + (ENDPOINT || '(belum diatur)'));
});
