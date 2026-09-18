'use strict';

const parse = require('./parse');

const UA =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  header() {
    if (this.cookies.size === 0) return '';
    return Array.from(this.cookies.entries())
      .map(function (entry) {
        return entry[0] + '=' + entry[1];
      })
      .join('; ');
  }

  absorb(res) {
    let list = [];
    if (typeof res.headers.getSetCookie === 'function') {
      list = res.headers.getSetCookie();
    } else {
      const single = res.headers.get('set-cookie');
      if (single) list = [single];
    }
    for (const cookie of list) {
      const pair = cookie.split(';')[0];
      const idx = pair.indexOf('=');
      if (idx < 0) continue;
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (key) this.cookies.set(key, value);
    }
  }
}

class Target {
  constructor(config) {
    this.endpoint = String(config.endpoint || '').replace(/\/+$/, '');
    this.jar = new CookieJar();
    this.authenticated = false;
    this.profile = null;
    this.lastError = null;
  }

  async request(path, options) {
    const opts = options || {};
    const headers = Object.assign(
      {
        'User-Agent': UA,
        Accept: 'text/html,application/json,application/xhtml+xml,*/*'
      },
      opts.headers || {}
    );
    const cookie = this.jar.header();
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(this.endpoint + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body,
      redirect: 'manual'
    });
    this.jar.absorb(res);
    return res;
  }

  async getText(path) {
    const res = await this.request(path);
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  }

  async postForm(path, fields) {
    const body = new URLSearchParams();
    for (const key of Object.keys(fields)) {
      const value = fields[key];
      if (value === undefined || value === null) continue;
      body.append(key, String(value));
    }
    const res = await this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  }

  async getCaptcha() {
    this.jar = new CookieJar();
    const page = await this.getText('/login_sisfo/index.php');
    const captchaPath = parse.extractCaptchaPath(page.text);
    if (!captchaPath) throw new Error('Tidak menemukan gambar captcha pada halaman login');
    const res = await this.request('/login_sisfo/' + captchaPath);
    const buffer = Buffer.from(await res.arrayBuffer());
    return 'data:image/jpeg;base64,' + buffer.toString('base64');
  }

  async login(username, password, captcha) {
    this.authenticated = false;
    this.profile = null;
    const res = await this.postForm('/login_sisfo/index.php/login2.html', {
      user: username,
      pass: password,
      captcha: captcha,
      log_in: 'true',
      ci_csrf_token: ''
    });

    let pageHtml = res.text;
    if (res.status >= 300 && res.status < 400 && res.location) {
      const next = await this.getText(this.resolve(res.location));
      pageHtml = next.text;
    }

    if (/Selamat Datang/i.test(pageHtml) && /Hak akses Anda/i.test(pageHtml)) {
      this.authenticated = true;
      const nameMatch = pageHtml.match(/Selamat Datang\s*<b>([^<]*)<\/b>/i);
      const roleMatch = pageHtml.match(/Hak akses Anda sebagai\s*<b>([^<]*)<\/h5>/i);
      this.profile = {
        nama: nameMatch ? parse.decodeEntities(nameMatch[1]).trim() : '',
        role: roleMatch ? parse.decodeEntities(roleMatch[1]).trim() : ''
      };
      return { ok: true, profile: this.profile };
    }

    if (/captcha/i.test(pageHtml) && /salah|tidak sesuai|invalid/i.test(pageHtml)) {
      return { ok: false, error: 'Captcha salah atau sudah kedaluwarsa.' };
    }
    if (/password|username/i.test(pageHtml) && /salah|tidak/i.test(pageHtml)) {
      return { ok: false, error: 'Username atau password salah.' };
    }
    return { ok: false, error: 'Login gagal. Periksa kembali data login.' };
  }

  exportCookies() {
    const out = {};
    for (const entry of this.jar.cookies.entries()) out[entry[0]] = entry[1];
    return out;
  }

  importCookies(cookies) {
    this.jar = new CookieJar();
    for (const key of Object.keys(cookies || {})) this.jar.cookies.set(key, cookies[key]);
  }

  async hydrate(cookies) {
    this.importCookies(cookies);
    this.authenticated = false;
    this.profile = null;
    try {
      const page = await this.getText('/login_sisfo/index.php/index.html');
      if (/Selamat Datang/i.test(page.text) && /Hak akses Anda/i.test(page.text)) {
        this.authenticated = true;
        const nameMatch = page.text.match(/Selamat Datang\s*<b>([^<]*)<\/b>/i);
        const roleMatch = page.text.match(/Hak akses Anda sebagai\s*<b>([^<]*)<\/h5>/i);
        this.profile = {
          nama: nameMatch ? parse.decodeEntities(nameMatch[1]).trim() : '',
          role: roleMatch ? parse.decodeEntities(roleMatch[1]).trim() : ''
        };
      }
    } catch (e) {
      this.authenticated = false;
    }
    return this.authenticated;
  }

  resolve(location) {
    if (/^https?:\/\//i.test(location)) {
      const u = new URL(location);
      return u.pathname + u.search;
    }
    if (location.indexOf('/') === 0) return location;
    return '/' + location;
  }

  async postPaged(pathBase, fields, marker, maxPages) {
    const limit = maxPages || 120;
    const rows = [];

    const first = await this.postForm(pathBase, fields);
    let pageRows = parse.extractRows(first.text, marker);
    for (const row of pageRows) rows.push(row);

    let offset = 10;
    while (pageRows.length === 10 && offset / 10 < limit) {
      const res = await this.getText(pathBase + '/' + offset);
      pageRows = parse.extractRows(res.text, marker);
      if (!pageRows.length) break;
      for (const row of pageRows) rows.push(row);
      offset += 10;
    }
    return rows;
  }

  async getBalita(filters) {
    const f = filters;
    const fields = {
      prov: f.prov,
      kab: f.kab,
      kec: f.kec,
      kode_pusk: f.kode_pusk,
      pkm: f.pkm,
      kel: f.kel,
      POSY: f.POSY,
      usia: f.usia,
      bulan: f.bulan,
      tahun: f.tahun,
      vita: '',
      cari: 'Cari Data'
    };

    const tdkRows = await this.postPaged(
      '/ppgbm/index.php/Laporan/daftar_tidak_ditimbang',
      fields,
      'Balita/perkembangan/'
    );

    let dtbRows = [];
    try {
      dtbRows = await this.postPaged(
        '/ppgbm/index.php/Laporan/daftar_ditimbang',
        fields,
        'Balita/perkembangan/'
      );
    } catch (e) {
      dtbRows = [];
    }

    const byNik = new Map();

    if (dtbRows.length > 0) {
      for (const cells of tdkRows) {
        const nik = cells[1];
        if (!nik) continue;
        byNik.set(nik, {
          nik: nik,
          nama: cells[2] || '',
          jk: cells[3] || '',
          tglLahir: cells[4] || '',
          ortu: cells[5] || '',
          desa: cells[10] || '',
          posyandu: cells[11] || '',
          status: 'belum',
          hasil: null
        });
      }
      for (const cells of dtbRows) {
        const nik = cells[1];
        if (!nik) continue;
        byNik.set(nik, {
          nik: nik,
          nama: cells[2] || '',
          jk: cells[3] || '',
          tglLahir: cells[4] || '',
          ortu: '',
          desa: cells[9] || '',
          posyandu: cells[10] || '',
          status: 'sudah',
          hasil: {
            tanggalUkur: cells[14] || '',
            bbu: cells[15] || '',
            tbu: cells[16] || '',
            bbtb: cells[17] || '',
            jumlah: cells[18] || ''
          }
        });
      }
    } else {
      const masterRows = await this.postPaged(
        '/ppgbm/index.php/Balita/daftar',
        { kel: f.kel, POSY: f.POSY, usia: f.usia, nik: '', nama: '', nik_ibu: '' },
        'Balita/ukur/'
      );
      const belum = new Set(
        tdkRows.map(function (cells) { return cells[1]; }).filter(Boolean)
      );
      for (const cells of masterRows) {
        const nik = cells[1];
        if (!nik) continue;
        byNik.set(nik, {
          nik: nik,
          nama: cells[2] || '',
          jk: cells[3] || '',
          tglLahir: cells[4] || '',
          ortu: cells[5] || '',
          desa: cells[10] || '',
          posyandu: cells[11] || '',
          status: belum.has(nik) ? 'belum' : 'sudah',
          hasil: null
        });
      }
    }

    const children = Array.from(byNik.values());
    children.sort(function (a, b) {
      return a.nama.localeCompare(b.nama);
    });
    return children;
  }

  async getPerkembangan(nik) {
    const res = await this.getText('/ppgbm/index.php/Balita/perkembangan/' + encodeURIComponent(nik) + '.html');
    return parse.extractMeasurements(res.text);
  }

  async getUbah(nik, bulan, tahun) {
    const res = await this.getText(
      '/ppgbm/index.php/Balita/ubah_ukur/' +
        encodeURIComponent(nik) +
        '/' +
        encodeURIComponent(bulan) +
        '/' +
        encodeURIComponent(tahun) +
        '.html'
    );
    const m = res.text.match(/<form[^>]*save_ubah_ukur[\s\S]*?<\/form>/i);
    const fields = m ? parse.extractFormFields(m[0]) : {};
    return { fields: fields };
  }

  async getUkur(nik, bulan, tahun) {
    const res = await this.getText('/ppgbm/index.php/Balita/ukur/' + encodeURIComponent(nik) + '.html');
    if (res.status !== 200 || !/frmSave/i.test(res.text)) {
      throw new Error('Tidak dapat membuka form pengukuran untuk NIK ' + nik);
    }
    const hidden = parse.extractHiddenInputs(parse.findForm(res.text, 'frmSave'));
    const history = parse.extractMeasurements(res.text);

    const editPattern = new RegExp(
      'Balita/ubah_ukur/' + nik + '/' + bulan + '/' + tahun + '\\.html',
      'i'
    );
    const exists = Boolean(bulan && tahun) && editPattern.test(res.text);

    let existing = null;
    let ubahFields = null;
    let idUkur = '';
    if (exists) {
      const ubah = await this.getUbah(nik, bulan, tahun);
      ubahFields = ubah.fields;
      idUkur = ubah.fields.id_ukur || '';
      const vitaEdit = ubah.fields.vita;
      existing = {
        TANGGALUKUR: ubah.fields.TANGGALUKUR || '',
        BERAT: ubah.fields.BERAT || '',
        TINGGI: ubah.fields.TINGGI || '',
        LILA: ubah.fields.LILA || '',
        UKURLILA: ubah.fields.UKURLILA || '',
        UKURBERAT: ubah.fields.UKURBERAT || '',
        kelas_ibu_balita: ubah.fields.kelas_ibu_balita || '',
        mbg: ubah.fields.mbg || '',
        CARAUKUR: ubah.fields.CARAUKUR || '2',
        vita: vitaEdit === '2' ? '0' : (vitaEdit === '1' ? '1' : (vitaEdit || '0'))
      };
    }

    return {
      nik: nik,
      hidden: hidden,
      existing: existing,
      history: history,
      mode: exists ? 'edit' : 'add',
      idUkur: idUkur,
      ubahFields: ubahFields
    };
  }

  buildUkurFields(hidden, values, mode, idUkur) {
    const fields = Object.assign({}, hidden);
    fields.ci_csrf_token = '';
    fields.tipe = mode;
    fields.id_ukur = idUkur || '';
    fields.TANGGALUKUR = values.TANGGALUKUR || '';
    fields.BERAT = values.BERAT || '';
    fields.TINGGI = values.TINGGI || '';
    fields.LILA = values.LILA || '';
    fields.UKURLILA = values.UKURLILA || '';
    fields.UKURBERAT = values.UKURBERAT || '';
    fields.kelas_ibu_balita = values.kelas_ibu_balita || '';
    fields.mbg = values.mbg || '';
    fields.CARAUKUR = values.CARAUKUR || '';
    fields.vita = values.vita || '';
    if (values.BULANUKUR) fields.BULANUKUR = values.BULANUKUR;
    return fields;
  }

  applyValues(base, values) {
    const fields = Object.assign({}, base);
    fields.ci_csrf_token = '';
    const mapping = [
      'TANGGALUKUR', 'BERAT', 'TINGGI', 'LILA', 'UKURLILA',
      'UKURBERAT', 'kelas_ibu_balita', 'mbg', 'CARAUKUR', 'vita'
    ];
    for (const key of mapping) {
      if (values[key] !== undefined) fields[key] = values[key];
    }
    return fields;
  }

  async saveUkur(nik, bulan, tahun, values) {
    const form = await this.getUkur(nik, bulan, tahun);
    let res;
    let mode;

    if (form.mode === 'edit' && form.ubahFields) {
      mode = 'edit';
      const normalized = Object.assign({}, values);
      if (normalized.vita === '0') normalized.vita = '2';
      else if (normalized.vita === '' || normalized.vita === undefined) delete normalized.vita;
      const fields = this.applyValues(form.ubahFields, normalized);
      fields.tipe = 'edit';
      fields.id_ukur = form.idUkur || form.ubahFields.id_ukur || '';
      res = await this.postForm('/ppgbm/index.php/Balita/save_ubah_ukur.html', fields);
    } else {
      mode = 'add';
      const fields = this.buildUkurFields(form.hidden, values, 'add', '');
      res = await this.postForm('/ppgbm/index.php/Balita/save_ukur.html', fields);
    }

    const verify = await this.getUkur(nik, bulan, tahun);
    const saved = verify.existing || null;
    const expected = String(values.BERAT || '').replace(',', '.');
    const actual = saved ? String(saved.BERAT || '').replace(',', '.') : '';
    const numericMatch =
      expected !== '' &&
      actual !== '' &&
      Math.abs(parseFloat(expected) - parseFloat(actual)) < 0.0001;

    return {
      nik: nik,
      mode: mode,
      httpStatus: res.status,
      location: res.location || '',
      saved: saved,
      verified: numericMatch
    };
  }
}

module.exports = { Target: Target };
