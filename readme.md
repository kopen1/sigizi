endpoint = https://sigizikesga.kemkes.go.id/

Karna website nya masih Kurang Kompetible untuk pengisian data. 
aku ingin memperbaiki website itu biar lebih mudah dan ngecek dan input data. 

step A: page Pelayanan Kesehatan > Entry > Balita > Daftar Balita.
Step B: Laporan > Anak Tumbuh Kembang > Daftar Di timbang
Step C: Laporan > Anak Tumbuh Kembang >  & Daftar Tidak di timbang.

Untuk Target Pencarian Data Defualt nanti 
provinsi: Jawa Tengah 
Kabupaten: Demak 
Kecamatan: Karangawen
Puskesmas: Karangawen 1
Desa: Brambang
posyandu: Krajan Lor 
usia: 0-59 bulan
pengukuran Bulan: buat drowpdown (Januari - Desember)
Tahun: Drowpdown ( sesuai data yang ada )

yang saya keluhkan di website itu, tidak ada filter untuk data yang belum di isi dan sudah. 
dan waktu ingin input data yang belum di input/uodate di bulan Baru harus mencari satu" dan di page beda. tidak di page yang sama. 

untuk target / Rencana.
buatlah list yang sudah di input, yang belum kasih button untuk edit di samping nama listnya. / bisa di buat sekali edit semua yang ingin di edit. 
sebenernya yang di edit hanya bbnya. tapi prosesnya terlalu mutar". sedangkan kalau orang tua yang ngisi tambah bingung.
exmp: Si A hanya ingin edit bb di bulan ini. 

harus buka step B, Kemudian Step C > Step C  > klik edit > Baru bisa di tambah Pengukuran.

Sangat Tidak Workit sekelas Website Yang profesional. 

Seharusnya kan ada filter Bila belum di isi langsung ada button edit.

---

## Tool: Sigizi Simple

Website baru (Node.js, tanpa dependency) yang login ke Sigizi lalu menyajikan
satu halaman gabungan **Step B + Step C** dengan tombol isi/edit BB langsung.

### Cara menjalankan
```
node server.js
```
Lalu buka `http://127.0.0.1:8790` di browser. Port bisa diubah: `PORT=9000 node server.js`.

### Alur
1. Masukkan captcha (gambar diambil dari server asli), klik **Login**.
   Username/password dibaca dari `.env` dan tidak pernah dikirim ke browser.
2. Pilih Bulan, Tahun, Desa, Posyandu, Usia, Status, lalu **Muat Data**.
   Default: Jawa Tengah / Demak / Karangawen / Karangawen I / Brambang /
   Krajan Lor, usia 0-59 bulan.
3. Tabel menampilkan status **Sudah/Belum** per bulan. Pakai dropdown **Status**
   untuk pindah: **Belum** (mengejar yang belum diisi) atau **Sudah**
   (mengoreksi yang sudah terisi).
4. Tombol **Isi BB / Edit / Koreksi** membuka halaman editor penuh
   (BB, TB, LiLa, lingkar kepala, edema, kelas ibu, MBG, Vit A) untuk mengisi
   baru maupun memperbaiki data yang salah/kurang. Kolom penting yang masih
   kosong ditandai garis oranye.
5. Form isi/koreksi menampilkan **referensi Berat & Tinggi Badan bulan
   sebelumnya** (atau pengukuran terakhir) supaya tidak menebak.
6. Centang beberapa balita lalu **Isi BB Terpilih** untuk input massal.
   **BB & TB diisi per anak** (tidak disamakan); hanya nilai umum (Tanggal,
   Cara Ukur, Kelas Ibu, Vit A, MBG, edema) yang sama untuk semua. Referensi
   bulan sebelumnya juga dimuat per anak.

Satu tab **Data Balita** untuk semua: isi (status Belum) maupun koreksi
(status Sudah), tinggal ganti dropdown Status.

Tab **Pengaturan** dipakai untuk mengubah **default pencarian** (Kecamatan,
Puskesmas, Desa, Posyandu, Usia). Provinsi & Kabupaten mengikuti akun yang login
dan tidak ditampilkan. Disimpan di `config.json` dan otomatis dipakai setiap
membuka aplikasi.

### Catatan
- File `.env` berisi kredensial asli. Jangan di-commit (sudah masuk `.gitignore`).
  Sebaiknya password diganti karena pernah dibagikan.
- Sesi login disimpan otomatis di `.session.json` (juga masuk `.gitignore`) sehingga
  restart `node server.js` tidak perlu login/captcha lagi selama cookie masih berlaku
  (masa berlaku dari server Sigizi ±2 jam). Logout akan menghapus file ini.
- Setelah menyimpan, tool membaca ulang data untuk memverifikasi BB tersimpan.
- Data pribadi (nama, NIK, dll.) hanya lewat memori server lokal, tidak disimpan ke file.
- Saat laporan **Daftar Ditimbang** dibatasi server ("Batas Rekap"), tool otomatis
  memakai **Daftar Balita + Tidak Ditimbang** untuk menentukan status. Akibatnya
  kolom Tgl Ukur/BB-U untuk data "Sudah" bisa kosong; detailnya tetap terbaca
  saat membuka form isi/koreksi.
- Server Sigizi kadang lambat (5-15 detik/request). Tool menyimpan cache
  **opsi wilayah** (Kecamatan/Puskesmas/Desa/Posyandu, file `.cache-options.json`,
  24 jam) dan **form ukur** (5 menit, dibuang otomatis setelah simpan). Jadi
  setelah dimuat sekali, buka Pengaturan/editor berikutnya jadi hampir instan.

### Deploy Cloudflare Workers (via GitHub, direkomendasikan)
Aplikasi sudah di-port ke **Cloudflare Workers**: `worker/index.js` memakai
logika yang sama (`lib/target.js`), sesi/config/cache disimpan di **KV**,
file statis di folder `public/` disajikan lewat aset Worker. Deploy otomatis
dari GitHub lewat `.github/workflows/deploy-cloudflare.yml`.

Langkah sekali saja:
1. Buat KV namespace:
   ```
   npx wrangler kv namespace create SIGIZI_KV
   ```
   Salin `id`-nya ke `wrangler.toml` (ganti `GANTI_DENGAN_KV_ID_ANDA`).
2. Di GitHub → repo → **Settings → Secrets and variables → Actions**, tambah:
   - `CLOUDFLARE_API_TOKEN` (izin: Workers Scripts Edit + Workers KV Storage Edit)
   - `CLOUDFLARE_ACCOUNT_ID`
   - `SIGIZI_USER`, `SIGIZI_PASS`, `APP_PASSWORD`
   (`SIGIZI_ENDPOINT` sudah diisi di `wrangler.toml` `[vars]`.)
3. Push ke `main` → workflow `Deploy to Cloudflare Workers` build & deploy.
   URL: `https://sigizi-simple.<subdomain-anda>.workers.dev`.

Catatan:
- `APP_PASSWORD` wajib supaya tidak sembarang orang memakai akun Sigizi.
- Sesi Sigizi disimpan di KV (bertahan antar request). Bila sesi kedaluwarsa,
  login captcha lagi lewat halaman aplikasi.
- Backend ini tetap meneruskan request ke server Sigizi; bila server Sigizi
  memblokir IP Cloudflare, deploy ini tidak akan bisa mengambil data.

### Alternatif cepat: Cloudflare Tunnel (cloudflared) dari perangkat lokal
Cara ini menjalankan Node di perangkat sendiri, lalu dipublikasikan lewat
Cloudflare (butuh `cloudflared` terpasang: `pkg install cloudflared`).

```
export APP_PASSWORD='password-pilihan-anda'   # wajib, untuk melindungi
bash run-public.sh                            # server + tunnel di background
```
URL publik muncul di `$TMPDIR/sigizi-cf.log` (bentuk
`https://xxxx.trycloudflare.com`). Hentikan dengan:
```
bash run-public.sh stop
```
Catatan:
- URL quick tunnel **berubah setiap start**. Untuk URL tetap, buat *named
  tunnel* + domain di dashboard Cloudflare.
- Tanpa `APP_PASSWORD`, siapa pun yang punya URL bisa memakai akun Sigizi.
- `start-public.sh` sama, tapi jalan di depan (foreground).

### Alternatif: hosting (Render/Railway/Fly)
Repo sudah menyiapkan `Dockerfile` dan `render.yaml`, jadi bisa auto-deploy
setiap push ke GitHub.

Isi environment variable di dashboard host:
- `SIGIZI_ENDPOINT` — `https://sigizikesga.kemkes.go.id`
- `SIGIZI_USER` — username akun
- `SIGIZI_PASS` — password akun
- `APP_PASSWORD` — **wajib** untuk deploy publik (mencegah orang lain memakai
  akun ini). Saat set, browser akan meminta login aplikasi (user default `sigizi`).
- `APP_USER` — opsional, default `sigizi`.

Catatan hosting: file `.session.json`/`.cache-options.json` bersifat sementara
(ephemeral) di container, jadi setelah restart perlu login captcha lagi.
Kredensial **tidak** ikut ter-commit (`.env` diabaikan).