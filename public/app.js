'use strict';

var state = {
  defaults: {},
  children: [],
  view: [],
  selected: new Set(),
  bulan: '',
  tahun: ''
};

var BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function $(id) { return document.getElementById(id); }

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function api(path, options) {
  return fetch(path, options).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) throw new Error(data.error || 'Permintaan gagal (' + res.status + ')');
      return data;
    });
  });
}

function todayDdMmYyyy() {
  var d = new Date();
  return String(d.getDate()).padStart(2, '0') + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
}

function toIsoDate(value) {
  if (!value) return '';
  var m = String(value).match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) {
    var p = String(value).split('-');
    return p[0] + '-' + String(p[1]).padStart(2, '0') + '-' + String(p[2]).padStart(2, '0');
  }
  return value;
}

function toDisplayDate(value) {
  var iso = toIsoDate(value);
  var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : value;
}

function field(prefix, name) {
  var el = document.querySelector('.' + prefix + '-' + name);
  return el ? el.value.trim() : '';
}

function input(prefix, name, value, attrs) {
  return '<input class="' + prefix + '-' + name + '" id="' + prefix + '-' + name + '" type="text" value="' +
    escapeHtml(value || '') + '" ' + (attrs || '') + ' />';
}

function select(prefix, name, options, selected) {
  return '<select class="' + prefix + '-' + name + '" id="' + prefix + '-' + name + '">' +
    options.map(function (o) {
      return '<option value="' + escapeHtml(o.value) + '"' +
        (String(o.value) === String(selected) ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
    }).join('') + '</select>';
}

var CARA_OPTS = [{ value: '1', label: 'Berdiri' }, { value: '2', label: 'Terlentang' }];
var YA_TIDAK = [{ value: '', label: '--Pilih--' }, { value: '1', label: 'Ya' }, { value: '0', label: 'Tidak' }];
var EDEMA_OPTS = [{ value: '', label: '--Pilih--' }, { value: '1', label: 'Ada (+1)' },
  { value: '2', label: 'Ada (+2)' }, { value: '3', label: 'Ada (+3)' }, { value: '4', label: 'Tidak' }];

function fullUkurFields(prefix, values) {
  values = values || {};
  return '' +
    '<div class="inline-fields">' +
    '<div><label>Tanggal Ukur (dd-mm-yyyy) *</label>' + input(prefix, 'tanggal', values.TANGGALUKUR || todayDdMmYyyy()) + '</div>' +
    '<div><label>Cara Ukur TB *</label>' + select(prefix, 'caraukur', CARA_OPTS, values.CARAUKUR || '2') + '</div>' +
    '</div>' +
    '<div class="inline-fields">' +
    '<div><label>Berat Badan (kg) *</label>' + input(prefix, 'berat', values.BERAT, 'inputmode="decimal"') + '</div>' +
    '<div><label>Tinggi Badan (cm)</label>' + input(prefix, 'tinggi', values.TINGGI, 'inputmode="decimal"') + '</div>' +
    '</div>' +
    '<div class="inline-fields">' +
    '<div><label>LiLa (cm)</label>' + input(prefix, 'lila', values.LILA, 'inputmode="decimal"') + '</div>' +
    '<div><label>Lingkar Kepala (cm)</label>' + input(prefix, 'ukurlila', values.UKURLILA, 'inputmode="decimal"') + '</div>' +
    '</div>' +
    '<div class="inline-fields">' +
    '<div><label>Pitting edema</label>' + select(prefix, 'ukurbedema', EDEMA_OPTS, values.UKURBERAT) + '</div>' +
    '<div><label>Kelas Ibu Balita *</label>' + select(prefix, 'kelas', YA_TIDAK, values.kelas_ibu_balita) + '</div>' +
    '</div>' +
    '<div class="inline-fields">' +
    '<div><label>Menerima MBG</label>' + select(prefix, 'mbg', YA_TIDAK, values.mbg) + '</div>' +
    '<div><label>Vitamin A</label>' + select(prefix, 'vita', [{ value: '', label: '--Pilih--' }, { value: '1', label: 'Ya' }, { value: '0', label: 'Tidak' }], values.vita || '0') + '</div>' +
    '</div>';
}

function sharedUkurFields(prefix, values) {
  values = values || {};
  return '' +
    '<div class="inline-fields">' +
    '<div><label>Tanggal Ukur (dd-mm-yyyy) *</label>' + input(prefix, 'tanggal', values.TANGGALUKUR || todayDdMmYyyy()) + '</div>' +
    '<div><label>Cara Ukur TB *</label>' + select(prefix, 'caraukur', CARA_OPTS, values.CARAUKUR || '2') + '</div>' +
    '</div>' +
    '<div class="inline-fields">' +
    '<div><label>Kelas Ibu Balita *</label>' + select(prefix, 'kelas', YA_TIDAK, values.kelas_ibu_balita) + '</div>' +
    '<div><label>Vitamin A</label>' + select(prefix, 'vita', [{ value: '', label: '--Pilih--' }, { value: '1', label: 'Ya' }, { value: '0', label: 'Tidak' }], values.vita || '0') + '</div>' +
    '</div>' +
    '<div class="inline-fields">' +
    '<div><label>Menerima MBG</label>' + select(prefix, 'mbg', YA_TIDAK, values.mbg) + '</div>' +
    '<div><label>Pitting edema</label>' + select(prefix, 'ukurbedema', EDEMA_OPTS, values.UKURBERAT) + '</div>' +
    '</div>';
}

function collectFull(prefix) {
  return {
    TANGGALUKUR: field(prefix, 'tanggal'),
    BERAT: field(prefix, 'berat').replace(',', '.'),
    TINGGI: field(prefix, 'tinggi').replace(',', '.'),
    LILA: field(prefix, 'lila').replace(',', '.'),
    UKURLILA: field(prefix, 'ukurlila').replace(',', '.'),
    UKURBERAT: field(prefix, 'ukurbedema'),
    kelas_ibu_balita: field(prefix, 'kelas'),
    mbg: field(prefix, 'mbg'),
    CARAUKUR: field(prefix, 'caraukur') || '2',
    vita: field(prefix, 'vita') || '0'
  };
}

function collectShared(prefix) {
  return {
    TANGGALUKUR: field(prefix, 'tanggal'),
    LILA: '',
    UKURLILA: '',
    UKURBERAT: field(prefix, 'ukurbedema'),
    kelas_ibu_balita: field(prefix, 'kelas'),
    mbg: field(prefix, 'mbg'),
    CARAUKUR: field(prefix, 'caraukur') || '2',
    vita: field(prefix, 'vita') || '0'
  };
}

function validate(values, prefix) {
  if (!values.TANGGALUKUR) return 'Tanggal ukur wajib diisi.';
  if (!values.BERAT) return 'Berat badan wajib diisi.';
  if (!values.CARAUKUR) return 'Cara ukur wajib dipilih.';
  if (!values.kelas_ibu_balita) return 'Kelas Ibu Balita wajib dipilih.';
  return null;
}

/* ---------- Login ---------- */

function loadCaptcha() {
  $('captcha-img').removeAttribute('src');
  return api('/api/captcha').then(function (data) {
    $('captcha-img').src = data.image;
    $('login-captcha').value = '';
    $('login-captcha').focus();
  }).catch(function (err) {
    $('login-error').textContent = err.message;
  });
}

function doLogin() {
  var captcha = $('login-captcha').value.trim();
  if (!captcha) { $('login-error').textContent = 'Isi captcha dulu.'; return; }
  $('login-btn').disabled = true;
  $('login-error').textContent = 'Memproses...';
  api('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      captcha: captcha,
      username: $('login-username').value.trim(),
      password: $('login-password').value
    })
  }).then(function (data) {
    if (!data.ok) throw new Error(data.error || 'Login gagal');
    enterApp(data.profile);
  }).catch(function (err) {
    $('login-error').textContent = err.message;
    loadCaptcha();
  }).finally(function () {
    $('login-btn').disabled = false;
  });
}

/* ---------- Setup ---------- */

function enterApp(profile) {
  $('login-view').classList.add('hidden');
  $('app-view').classList.remove('hidden');
  $('profile-nama').textContent = (profile && profile.nama) || 'Pengguna';
  $('profile-role').textContent = (profile && profile.role) || '';
}

function fillBulanTahun() {
  var now = new Date();
  $('f-bulan').innerHTML = BULAN.map(function (name, i) {
    var value = i + 1;
    return '<option value="' + value + '"' + (value === now.getMonth() + 1 ? ' selected' : '') + '>' + name + '</option>';
  }).join('');
  var current = now.getFullYear();
  var out = '';
  for (var y = current; y >= current - 10; y--) {
    out += '<option value="' + y + '"' + (y === current ? ' selected' : '') + '>' + y + '</option>';
  }
  $('f-tahun').innerHTML = out;
}

function fillKelOptions(defaults) {
  return api('/api/options?type=kel&id=' + encodeURIComponent(defaults.pkm)).then(function (data) {
    $('f-kel').innerHTML = data.options.map(function (o) {
      return '<option value="' + escapeHtml(o.kodewil) + '"' + (o.kodewil === defaults.kel ? ' selected' : '') + '>' + escapeHtml(o.NAMA_DESA) + '</option>';
    }).join('');
    return fillPosyOptions($('f-kel').value, defaults);
  });
}

function fillPosyOptions(kel, defaults) {
  return api('/api/options?type=posy&id=' + encodeURIComponent(kel)).then(function (data) {
    $('f-posy').innerHTML = data.options.map(function (o) {
      var selected = defaults && o.kodewil === defaults.POSY ? ' selected' : '';
      return '<option value="' + escapeHtml(o.kodewil) + '"' + selected + '>' + escapeHtml(o.NAMA_POSYANDU) + '</option>';
    }).join('');
  });
}

/* ---------- Data ---------- */

function currentFilter() {
  return {
    bulan: $('f-bulan').value,
    tahun: $('f-tahun').value,
    kel: $('f-kel').value,
    POSY: $('f-posy').value,
    usia: $('f-usia').value
  };
}

function loadData() {
  var f = currentFilter();
  state.bulan = Number(f.bulan);
  state.tahun = Number(f.tahun);
  state.selected.clear();
  updateBulkBar();
  $('summary').textContent = 'Memuat...';
  var qs = Object.keys(f).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(f[k]);
  }).join('&');
  api('/api/balita?' + qs).then(function (data) {
    state.children = data.data;
    $('summary').textContent = 'Total ' + data.total + ' | Belum: ' + data.belum + ' | Sudah: ' + data.sudah;
    render();
  }).catch(function (err) {
    $('summary').textContent = err.message;
  });
}

function render() {
  var status = $('f-status').value;
  var search = $('f-cari').value.trim().toLowerCase();
  state.view = state.children.filter(function (c) {
    if (status !== 'semua' && c.status !== status) return false;
    if (search && c.nama.toLowerCase().indexOf(search) < 0) return false;
    return true;
  });

  state.view.sort(function (a, b) {
    var da = a.hasil ? toIsoDate(a.hasil.tanggalUkur) : '';
    var db = b.hasil ? toIsoDate(b.hasil.tanggalUkur) : '';
    if (da && db) {
      if (da === db) return a.nama.localeCompare(b.nama);
      return da < db ? 1 : -1;
    }
    if (da) return -1;
    if (db) return 1;
    return a.nama.localeCompare(b.nama);
  });

  var rows = state.view.map(function (c, i) {
    var checked = state.selected.has(c.nik) ? ' checked' : '';
    var tglUkur = c.hasil ? toDisplayDate(c.hasil.tanggalUkur) : '-';
    var bbu = c.hasil ? c.hasil.bbu : '-';
    var btnLabel = c.status === 'sudah' ? 'Edit / Koreksi' : 'Isi BB';
    var btnClass = c.status === 'sudah' ? 'row-btn edit' : 'row-btn isi';
    return '<tr>' +
      '<td class="chk"><input type="checkbox" data-nik="' + escapeHtml(c.nik) + '"' + checked + ' /></td>' +
      '<td>' + (i + 1) + '</td>' +
      '<td>' + escapeHtml(c.nama) + '</td>' +
      '<td>' + escapeHtml(c.jk) + '</td>' +
      '<td>' + escapeHtml(c.tglLahir) + '</td>' +
      '<td><span class="badge ' + c.status + '">' + (c.status === 'sudah' ? 'Sudah' : 'Belum') + '</span></td>' +
      '<td>' + escapeHtml(tglUkur) + '</td>' +
      '<td>' + escapeHtml(bbu) + '</td>' +
      '<td><button class="' + btnClass + '" data-ukur="' + escapeHtml(c.nik) + '">' + btnLabel + '</button></td>' +
      '</tr>';
  }).join('');

  $('balita-body').innerHTML = rows;
  $('empty').classList.toggle('hidden', state.view.length > 0);
}

function updateBulkBar() {
  $('bulk-count').textContent = state.selected.size + ' dipilih';
  $('bulkbar').classList.toggle('hidden', state.selected.size === 0);
}

/* ---------- Halaman Koreksi / Edit ---------- */

function showEditor(show) {
  $('editor-view').classList.toggle('hidden', !show);
  $('app-view').classList.toggle('hidden', show);
  if (show) window.scrollTo(0, 0);
}

function markMissingFields() {
  var important = ['tinggi', 'lila', 'ukurlila', 'ukurbedema', 'kelas', 'mbg'];
  important.forEach(function (name) {
    var el = document.querySelector('.e-' + name);
    if (el && !el.value) {
      var box = el.closest('div');
      if (box) box.classList.add('field-missing');
    }
  });
}

function pickReference(history, bulan, tahun) {
  var target = tahun * 12 + bulan;
  var items = (history || []).slice().sort(function (a, b) {
    return (b.tahun * 12 + b.bulan) - (a.tahun * 12 + a.bulan);
  });
  var before = items.filter(function (h) {
    return h.tahun * 12 + h.bulan < target;
  });
  if (before.length) return { item: before[0], label: 'Bulan sebelumnya' };
  if (items.length) return { item: items[0], label: 'Pengukuran terakhir' };
  return null;
}

function referenceHtml(ref) {
  if (!ref) return '';
  var it = ref.item;
  return '<div class="reference">' +
    '<div class="reference-label">Referensi ' + escapeHtml(ref.label) +
    ' (' + BULAN[it.bulan - 1] + ' ' + it.tahun + ')</div>' +
    '<div class="reference-values">Berat Badan (kg): <b>' + escapeHtml(it.bb || '-') + '</b>' +
    ' &nbsp;&middot;&nbsp; Tinggi Badan (cm): <b>' + escapeHtml(it.tb || '-') + '</b></div>' +
    '</div>';
}

function openEditor(nik) {
  var child = state.children.find(function (c) { return c.nik === nik; });
  showEditor(true);
  $('editor-title').textContent = child ? child.nama : nik;
  $('editor-sub').textContent = 'Memuat...';
  $('editor-body').innerHTML = '<p class="muted">Mengambil data dari server...</p>';
  $('editor-msg').textContent = '';

  api('/api/ukur/' + encodeURIComponent(nik) + '?bulan=' + state.bulan + '&tahun=' + state.tahun)
    .then(function (data) {
      $('editor-sub').innerHTML = 'Bulan ' + BULAN[state.bulan - 1] + ' ' + state.tahun + ' &middot; ' +
        (data.mode === 'edit' ? '<b>data sudah ada</b> (koreksi)' : '<b>data baru</b> (isi)');
      var ref = pickReference(data.history || [], state.bulan, state.tahun);
      $('editor-body').innerHTML = referenceHtml(ref) + fullUkurFields('e', data.existing || {});
      markMissingFields();
      $('editor-save').dataset.nik = nik;
      $('editor-save').dataset.mode = data.mode;
    })
    .catch(function (err) {
      $('editor-body').innerHTML = '<p class="error">' + escapeHtml(err.message) + '</p>';
    });
}

function saveEditor() {
  var nik = $('editor-save').dataset.nik;
  if (!nik) return;
  var values = collectFull('e');
  var problem = validate(values);
  if (problem) { $('editor-msg').textContent = problem; return; }
  $('editor-save').disabled = true;
  $('editor-msg').textContent = 'Menyimpan...';
  api('/api/ukur', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nik: nik, bulan: state.bulan, tahun: state.tahun, values: values })
  }).then(function (res) {
    $('editor-msg').textContent = res.verified ? 'Tersimpan & terverifikasi.' : 'Tersimpan, verifikasi belum cocok.';
    setTimeout(function () { showEditor(false); loadData(); }, 900);
  }).catch(function (err) {
    $('editor-msg').textContent = err.message;
  }).finally(function () {
    $('editor-save').disabled = false;
  });
}

function setTab(name) {
  $('tab-data').classList.toggle('active', name === 'data');
  $('tab-setting').classList.toggle('active', name === 'setting');
  if (name === 'setting') {
    openSetting();
    return;
  }
  showSetting(false);
  loadData();
}

/* ---------- Pengaturan default ---------- */

function showSetting(show) {
  $('setting-view').classList.toggle('hidden', !show);
  if (show) $('app-view').classList.add('hidden');
  else $('app-view').classList.remove('hidden');
  if (show) window.scrollTo(0, 0);
}

function fillSelect(id, options, selected, valueKey, labelKey) {
  $(id).innerHTML = options.map(function (o) {
    var v = valueKey && o[valueKey] !== undefined ? o[valueKey] : o.value;
    var l = labelKey && o[labelKey] !== undefined ? o[labelKey] : o.label;
    return '<option value="' + escapeHtml(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + escapeHtml(l) + '</option>';
  }).join('');
}

function loadSettingKec(selected) {
  return api('/api/options?type=kec&id=' + encodeURIComponent(state.settingBase.kab)).then(function (d) {
    fillSelect('s-kec', d.options, selected, 'kodewil', 'NAMA_KECAMATAN');
    return loadSettingPkm();
  });
}

function loadSettingPkm(selected) {
  return api('/api/options?type=pkm&id=' + encodeURIComponent($('s-kec').value)).then(function (d) {
    state.pkmOptions = d.options;
    fillSelect('s-pkm', d.options, selected, 'kodewil', 'NAMA_PUSKESMAS');
    return loadSettingKel();
  });
}

function loadSettingKel(selected) {
  return api('/api/options?type=kel&id=' + encodeURIComponent($('s-pkm').value)).then(function (d) {
    fillSelect('s-kel', d.options, selected, 'kodewil', 'NAMA_DESA');
    return loadSettingPosy();
  });
}

function loadSettingPosy(selected) {
  return api('/api/options?type=posy&id=' + encodeURIComponent($('s-kel').value)).then(function (d) {
    fillSelect('s-posy', d.options, selected, 'kodewil', 'NAMA_POSYANDU');
  });
}

function openSetting() {
  showSetting(true);
  $('setting-msg').textContent = 'Memuat opsi...';
  $('setting-save').disabled = true;
  $('s-usia').innerHTML = $('f-usia').innerHTML;
  api('/api/config').then(function (data) {
    var c = data.config || state.defaults || {};
    state.settingBase = { prov: c.prov || '', kab: c.kab || '' };
    return api('/api/options?type=kec&id=' + encodeURIComponent(state.settingBase.kab)).then(function (d) {
      fillSelect('s-kec', d.options, c.kec, 'kodewil', 'NAMA_KECAMATAN');
      return api('/api/options?type=pkm&id=' + encodeURIComponent($('s-kec').value));
    }).then(function (d) {
      state.pkmOptions = d.options;
      fillSelect('s-pkm', d.options, c.pkm, 'kodewil', 'NAMA_PUSKESMAS');
      return api('/api/options?type=kel&id=' + encodeURIComponent(c.pkm));
    }).then(function (d) {
      fillSelect('s-kel', d.options, c.kel, 'kodewil', 'NAMA_DESA');
      return api('/api/options?type=posy&id=' + encodeURIComponent(c.kel));
    }).then(function (d) {
      fillSelect('s-posy', d.options, c.POSY, 'kodewil', 'NAMA_POSYANDU');
      if (c.usia) $('s-usia').value = c.usia;
      $('setting-msg').textContent = '';
      $('setting-save').disabled = false;
    });
  }).catch(function (err) {
    $('setting-msg').textContent = err.message;
    $('setting-save').disabled = false;
  });
}

function saveSetting() {
  var pkm = ($('s-pkm').value || '');
  var pkmOpt = (state.pkmOptions || []).find(function (o) {
    return String(o.kodewil || o.ID) === String(pkm);
  });
  var base = state.settingBase || state.defaults || {};
  var cfg = {
    prov: base.prov || '',
    kab: base.kab || '',
    kec: $('s-kec').value,
    pkm: pkm,
    kode_pusk: pkmOpt ? (pkmOpt.KODE_PUSK || '') : '',
    kel: $('s-kel').value,
    POSY: $('s-posy').value,
    usia: $('s-usia').value
  };
  if (!cfg.kec || !cfg.pkm || !cfg.kel) {
    $('setting-msg').textContent = 'Lengkapi Kecamatan sampai Desa dulu.';
    return;
  }
  $('setting-save').disabled = true;
  $('setting-msg').textContent = 'Menyimpan...';
  api('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg)
  }).then(function (res) {
    state.defaults = res.config;
    $('setting-msg').textContent = 'Tersimpan.';
    return applyDefaults().then(function () {
      setTimeout(function () { setTab('data'); }, 600);
    });
  }).catch(function (err) {
    $('setting-msg').textContent = err.message;
  }).finally(function () {
    $('setting-save').disabled = false;
  });
}

function applyDefaults() {
  var d = state.defaults || {};
  if (d.usia) $('f-usia').value = d.usia;
  return fillKelOptions(d).then(function () {
    return loadData();
  });
}

/* ---------- Bulk ---------- */

function openBulk() {
  if (state.selected.size === 0) return;
  var selected = state.children.filter(function (c) { return state.selected.has(c.nik); });
  var html = '<div class="child-block"><strong>Nilai umum (berlaku untuk semua)</strong>' +
    sharedUkurFields('b', {}) + '</div>';
  html += selected.map(function (c) {
    return '<div class="child-block">' +
      '<div class="name">' + escapeHtml(c.nama) + '</div>' +
      '<div class="bulk-ref" data-nik="' + escapeHtml(c.nik) + '">Memuat referensi...</div>' +
      '<div class="inline-fields">' +
      '<div><label>Berat Badan (kg) *</label><input class="bulk-berat" data-nik="' + escapeHtml(c.nik) + '" type="text" inputmode="decimal" /></div>' +
      '<div><label>Tinggi Badan (cm)</label><input class="bulk-tinggi" data-nik="' + escapeHtml(c.nik) + '" type="text" inputmode="decimal" /></div>' +
      '</div></div>';
  }).join('');
  $('modal-title').textContent = 'Isi BB massal (' + selected.length + ' balita)';
  $('modal-body').innerHTML = html + '<div class="result-list" id="bulk-result"></div>';
  $('modal-submit').dataset.mode = 'bulk';
  $('modal-msg').textContent = '';
  $('modal').classList.remove('hidden');
  loadBulkRefs(selected);
}

function loadBulkRefs(list) {
  var limit = Math.min(list.length, 30);
  var i = 0;
  function next() {
    if (i >= limit) return;
    var child = list[i++];
    api('/api/ref/' + encodeURIComponent(child.nik))
      .then(function (data) {
        var ref = pickReference(data.history || [], state.bulan, state.tahun);
        var el = document.querySelector('.bulk-ref[data-nik="' + child.nik + '"]');
        if (!el) return;
        el.innerHTML = ref
          ? escapeHtml(ref.label) + ': BB <b>' + escapeHtml(ref.item.bb || '-') + '</b> kg, TB <b>' + escapeHtml(ref.item.tb || '-') + '</b> cm (' + BULAN[ref.item.bulan - 1] + ' ' + ref.item.tahun + ')'
          : 'Tanpa data pengukuran sebelumnya';
      })
      .catch(function () {
        var el = document.querySelector('.bulk-ref[data-nik="' + child.nik + '"]');
        if (el) el.textContent = 'Referensi tidak tersedia';
      })
      .finally(next);
  }
  next();
}

function submitBulk() {
  var shared = collectShared('b');
  if (!shared.TANGGALUKUR) { $('modal-msg').textContent = 'Tanggal ukur wajib diisi.'; return; }
  if (!shared.kelas_ibu_balita) { $('modal-msg').textContent = 'Kelas Ibu Balita wajib dipilih.'; return; }

  var inputs = document.querySelectorAll('.bulk-berat');
  var items = [];
  inputs.forEach(function (el) {
    var nik = el.dataset.nik;
    var berat = el.value.trim().replace(',', '.');
    if (!berat) return;
    var tinggiEl = document.querySelector('.bulk-tinggi[data-nik="' + nik + '"]');
    items.push({
      nik: nik,
      values: Object.assign({}, shared, {
        BERAT: berat,
        TINGGI: tinggiEl ? tinggiEl.value.trim().replace(',', '.') : ''
      })
    });
  });
  if (items.length === 0) { $('modal-msg').textContent = 'Isi minimal 1 BB.'; return; }

  $('modal-submit').disabled = true;
  $('modal-msg').textContent = 'Menyimpan ' + items.length + ' data...';
  api('/api/ukur/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bulan: state.bulan, tahun: state.tahun, items: items })
  }).then(function (res) {
    $('modal-msg').textContent = 'Selesai. Berhasil: ' + res.ok + ', gagal: ' + res.gagal;
    var failed = res.results.filter(function (r) { return !(r.ok && r.verified); });
    var box = document.getElementById('bulk-result');
    if (box) {
      box.innerHTML = failed.map(function (r) {
        var c = state.children.find(function (x) { return x.nik === r.nik; });
        return '<div class="fail">Gagal: ' + escapeHtml(c ? c.nama : r.nik) + ' &mdash; ' + escapeHtml(r.error || 'verifikasi tidak cocok') + '</div>';
      }).join('');
    }
    loadData();
  }).catch(function (err) {
    $('modal-msg').textContent = err.message;
  }).finally(function () {
    $('modal-submit').disabled = false;
  });
}

/* ---------- Events ---------- */

function closeModal() {
  $('modal').classList.add('hidden');
  $('modal-body').innerHTML = '';
  delete $('modal-submit').dataset.nik;
  delete $('modal-submit').dataset.mode;
}

var confirmCallback = null;

function confirmDialog(message, onYes, yesLabel) {
  confirmCallback = onYes || null;
  $('confirm-msg').textContent = message;
  $('confirm-yes').textContent = yesLabel || 'Ya';
  $('confirm-modal').classList.remove('hidden');
}

function closeConfirm() {
  $('confirm-modal').classList.add('hidden');
  confirmCallback = null;
}

function bindEvents() {
  $('captcha-refresh').addEventListener('click', loadCaptcha);
  $('login-btn').addEventListener('click', doLogin);
  $('login-captcha').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });

  $('logout-btn').addEventListener('click', function () {
    confirmDialog('Keluar dari aplikasi?', function () {
      api('/api/logout', { method: 'POST' }).then(function () { location.reload(); });
    }, 'Ya, keluar');
  });
  $('confirm-no').addEventListener('click', closeConfirm);
  $('confirm-modal').addEventListener('click', function (e) {
    if (e.target === $('confirm-modal')) closeConfirm();
  });
  $('confirm-yes').addEventListener('click', function () {
    var callback = confirmCallback;
    closeConfirm();
    if (callback) callback();
  });

  $('load-btn').addEventListener('click', loadData);
  $('f-status').addEventListener('change', render);
  $('f-cari').addEventListener('input', render);
  $('f-kel').addEventListener('change', function () {
    fillPosyOptions($('f-kel').value, null).catch(function (err) { $('summary').textContent = err.message; });
  });

  $('check-all').addEventListener('change', function () {
    if (this.checked) state.view.forEach(function (c) { state.selected.add(c.nik); });
    else state.view.forEach(function (c) { state.selected.delete(c.nik); });
    render();
    updateBulkBar();
  });

  $('balita-body').addEventListener('change', function (e) {
    if (e.target.matches('input[type="checkbox"][data-nik]')) {
      var nik = e.target.dataset.nik;
      if (e.target.checked) state.selected.add(nik); else state.selected.delete(nik);
      updateBulkBar();
    }
  });

  $('balita-body').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-ukur]');
    if (btn) openEditor(btn.dataset.ukur);
  });

  $('tab-data').addEventListener('click', function () { setTab('data'); });
  $('tab-setting').addEventListener('click', function () { setTab('setting'); });
  $('editor-back').addEventListener('click', function () { showEditor(false); });
  $('editor-save').addEventListener('click', saveEditor);

  $('setting-back').addEventListener('click', function () { setTab('data'); });
  $('setting-save').addEventListener('click', saveSetting);
  $('s-kec').addEventListener('change', function () {
    loadSettingPkm().catch(function (err) { $('setting-msg').textContent = err.message; });
  });
  $('s-pkm').addEventListener('change', function () {
    loadSettingKel().catch(function (err) { $('setting-msg').textContent = err.message; });
  });
  $('s-kel').addEventListener('change', function () {
    loadSettingPosy().catch(function (err) { $('setting-msg').textContent = err.message; });
  });

  $('bulk-btn').addEventListener('click', openBulk);
  $('bulk-clear').addEventListener('click', function () { state.selected.clear(); render(); updateBulkBar(); });
  $('modal-close').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
  $('modal-submit').addEventListener('click', submitBulk);
}

function init() {
  bindEvents();
  fillBulanTahun();
  api('/api/session').then(function (data) {
    state.defaults = data.defaults || {};
    if (data.username) $('login-username').value = data.username;
    if (data.authenticated) {
      enterApp(data.profile);
      applyDefaults().catch(function (err) { $('summary').textContent = err.message; });
    } else {
      loadCaptcha();
    }
  }).catch(function (err) {
    $('login-error').textContent = err.message;
  });
}

document.addEventListener('DOMContentLoaded', init);
