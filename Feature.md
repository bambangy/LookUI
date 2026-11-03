# LookUI — Feature Plan & Improvement Roadmap

> Dokumen ini adalah cetak biru pengembangan LookUI ke depan, mencakup fitur yang perlu ditambahkan, area perbaikan, dan strategi monetisasi berbasis lisensi.

---

## 0. Definisi `v1.0.0`

**`v1.0.0` adalah rilis stabil pertama yang production-ready — terstandardisasi di setiap aspek, bukan cuma bentuk API-nya.** Definisi ini sama persis maksudnya dengan bagian **"Release milestones"** di `CLAUDE.md` — kalau salah satu diubah, update juga yang lain. Selama belum rilis 1.0, minor release `0.x` masih boleh mengandung breaking change (lihat `CHANGELOG.md`).

Checklist lengkap (detail per item ada di §3 — Area Perbaikan):

- **Konvensi API dibekukan** — callback convention dan i18n/guard convention (lihat `CLAUDE.md` §0/§0b); semua komponen lolos audit konsistensi API (`el`/`id`/`hidden`/`enabled`/`destroy` via `applyBase`, penamaan `onX`/`beforeX` konsisten).
- **Testing** — Vitest mencakup setiap helper, component, dan composable (saat ini baru helper fondasi + registry + `lkDialog`/`Look.state` yang punya test; ~49 file di `src/js/components` + `src/js/composables` belum).
- **Code quality tooling** — ESLint + Stylelint terpasang dan lolos di seluruh repo.
- **Type definitions** — `.d.ts` mencakup seluruh public API.
- **Bundle size budget** — target gzip yang jelas dan tercapai, plus export yang benar-benar tree-shakeable (tanpa side effect lintas-komponen seperti `lkI18n.define()` di top-level modul yang memaksa seluruh bundle ikut ter-bundle).
- **Audit aksesibilitas** — selesai untuk dialog, popup, dan semua komponen interaktif.
- **Dokumentasi rapi** — satu halaman docs per component/composable (sudah terpenuhi), migration guide, dan `CONTRIBUTING.md`.
- **Tidak ada drift antara "published" dan "current"** — versi di `package.json`, rilis npm terbaru, dan `main` selaras (tidak ada batch besar yang belum di-commit/rilis menumpuk di atas tag terakhir).

Fase 2/3/4 di bawah (contoh integrasi MVC, Pro tier, monetisasi) adalah **post-1.0** — bernilai, tapi bukan bagian dari janji stabilitas yang dibawa 1.0.

---

## 1. Ringkasan Eksekutif

**LookUI** adalah library JavaScript & CSS untuk komponen UI dengan pendekatan *imperative, predictable, dan MVC-friendly*. Saat ini sudah memiliki fondasi kuat:
- Core utilities (`qs`, `qsa`, `createElement`, event bus, `autoDispose`/`disposeAll`/`disposeWithin`, `Look.state`)
- Behaviors (`lkToggleable`, `lkFocusTrap`, `lkSortable`)
- ~26 element-bound components (lihat `CLAUDE.md` § Current status untuk daftar lengkap)
- ~23 composables, termasuk `lkDialog` (sekarang dengan `open()` berbasis Promise + `channel`), `lkTable`, `lkForm`, `lkTree`, `lkMenu`, `lkOrg`, dll.
- Data helper (`lkDataSource`)

**Yang sudah selesai sejak draft pertama dokumen ini:** state layer (F-01), bridge opener↔popup (F-02), auto-dispose (F-03), dan setup testing (Vitest) — lihat §5 Fase 1.
**Yang masih belum ada:** contoh integrasi MVC nyata (F-04), ESLint/Stylelint, `.d.ts`, CI yang menjalankan test suite, bundle size yang sesuai budget, dan strategi lisensi untuk monetisasi (lihat §0 checklist 1.0 dan §4).

---

## 2. Feature Plan

### 2.1 Fondasi (P0 — syarat perlu, bukan syarat cukup, untuk v1.0)

> F-01/F-02/F-03 sudah **selesai** (lihat §5 Fase 1), tapi "fondasi selesai" ≠ "siap 1.0" — checklist lengkap
> ada di §0 di atas, status per-item teknis ada di §3.

#### F-01: State Layer (`Look.state`) — ✅ Selesai
**Masalah:** Event bus saat ini hanya untuk notifikasi, bukan state. Tidak ada cara berbagi data antar komponen.

**Solusi:**
```js
Look.state.set('cart', [...]);
Look.state.get('cart');
Look.state.subscribe('cart', (next, prev) => {});
Look.state.patch('user', { name: 'Budi' });
Look.state.reset();
```

**Detail:**
- Reactive ringan pakai `Proxy` + dependency tracking
- Namespace opsional untuk isolasi per halaman
- Snapshot & restore (berguna untuk form wizard)
- Integrasi dengan `lkDataSource` (data source bisa jadi bagian state)

**Estimasi:** 2-3 minggu

---

#### F-02: Bridge Opener ↔ Popup — ✅ Selesai
**Masalah:** `lkDialog`/`lkModal` saat ini hanya callback-based. Sulit untuk komposisi (nested popup, return value).

**Solusi:**
```js
// Promise-based
const result = await Look.lkDialog({
  title: 'Pilih user',
  content: '#user-selector',
}).open();

// Channel-based untuk interaksi kompleks
const dialog = Look.lkDialog({ ... }).open();
dialog.channel.send('filter', { role: 'admin' });
dialog.channel.on('select', (user) => { ... });
```

**Detail:**
- `open()` return Promise yang resolve saat close dengan value
- Channel API untuk komunikasi dua arah
- Dukungan nested popup (stack management)
- Auto-cleanup channel saat popup close

**Estimasi:** 2 minggu
**Implementasi:** `composables/dialog.js` — `api` sekarang thenable (`await Look.lkDialog({...}).open()` resolve `{ reason, confirmed, cancelled, value }`), `api.channel` (`send`/`on`/`off`). `destroy()` saat promise masih pending resolve dengan `reason: 'destroy'` (tidak hang). `lkModal` sengaja tetap sync-only — dia markup-bound toggle, bukan pola "buka lalu tunggu hasil".

---

#### F-03: Auto-Dispose — ✅ Selesai
**Masalah:** Semua komponen butuh `destroy()` manual. Di MVC, halaman reload terus — lupa destroy = memory leak.

**Solusi:**
```js
// Auto-track via MutationObserver
Look.autoDispose(true); // global opt-in

// Atau manual
Look.disposeAll();
Look.disposeWithin('#container');
```

**Detail:**
- `WeakMap` untuk tracking instance per elemen
- `MutationObserver` global yang detect elemen removed
- Opt-out per komponen kalau perlu kontrol manual
- Warning di console kalau ada instance tidak ter-dispose saat page unload

**Estimasi:** 1-2 minggu
**Implementasi:** `helpers/registry.js` + `applyBase` (`helpers/base.js`). Catatan: dipakai `Map` biasa, bukan `WeakMap` — `disposeAll()`/`disposeWithin()`/peringatan saat `beforeunload` butuh bisa di-iterate, dan entry hanya hidup selama instance belum `destroy()`, jadi tetap tidak bocor. `destroy()` kini idempoten di semua komponen `applyBase`-based (dipanggil dua kali = no-op).

---

#### F-04: Dokumentasi Integrasi Server-Side — ⬜ Belum (satu-satunya item Fase 1 yang belum selesai)
**Masalah:** Positioning "MVC-friendly" belum dibuktikan dengan contoh nyata.

**Solusi:**
- Contoh app **.NET MVC** lengkap (Razor view, partial, form)
- Contoh app **PHP** minimal
- Contoh **Rails** atau **Django** (opsional)
- Snippet untuk common pattern: re-init setelah AJAX, form validation server-side, dll

**Estimasi:** 3-4 minggu (tergantung jumlah stack)

---

### 2.2 Enhancement (P1 — Setelah v1.0 Stabil)

#### F-05: Reactive Attributes (MutationObserver-based)
Sinkronisasi otomatis antara DOM attribute dan instance:
```html
<div id="progress" data-lk-value="20" data-lk-max="100"></div>
```
Ubah attribute → komponen auto-update. Berguna untuk integrasi dengan server-rendered HTML.

---

#### F-06: Form Integration Helper — 🟡 Sudah ada, bentuk beda
**Catatan:** `lkForm` (`composables/form.js`) sudah ada dan menutupi use case ini — tapi bentuknya beda dari draft di
bawah: field registry + auto-discovery native control (bukan `schema`), `submit(handler)` (bukan option `onSubmit`),
error server lewat `lkValidation().setErrors()` / `extractFieldErrors()`. Perlakukan contoh di bawah sebagai arsip,
bukan API target.
```js
const form = Look.lkForm('#my-form', {
  schema: { email: { required: true, type: 'email' } },
  onSubmit(values) { /* ... */ },
});
form.validate();
form.setErrors({ email: 'Invalid' });
form.reset();
```

---

#### F-07: `lkDataSource` Enhancement
- Caching layer
- Optimistic update built-in
- Retry & exponential backoff
- Request cancellation (AbortController)
- Websocket/SSE support untuk realtime

---

#### F-08: Theme System — 🟡 Sudah ada, bentuk beda
**Catatan:** `lkTheme` (`composables/theme.js`) sudah ada — light/dark/system, persist ke `localStorage`, sync antar
tab — tapi sebagai composable per-instance (`const theme = lkTheme(opts)`), bukan global singleton `Look.theme`, dan
belum ada API `register('brand', tokens)` untuk custom brand token di bawah ini.
```js
Look.theme.set('dark');
Look.theme.register('brand', { primary: '#ff6600' });
```
Pakai CSS variables. Ringan, tidak perlu rebuild.

---

#### F-09: Accessibility Pass
- ARIA attributes konsisten di semua komponen
- Keyboard navigation standar
- Screen reader testing
- Fokus management untuk popup/modal

---

#### F-10: TypeScript Definitions
`.d.ts` file untuk autocomplete di IDE. Bukan migrasi ke TS — cukup definisi terpisah.

---

### 2.3 Advanced (P2 — Jangka Panjang)

#### F-11: Data Grid Pro
Komponen terpisah untuk tabel advance (virtual scroll, column resize, group by, export).

#### F-12: Scheduler / Calendar
Komponen kalender untuk booking, event, dll.

#### F-13: Chart Ringan
Wrapper minimal untuk Chart.js atau custom SVG-based.

#### F-14: Form Builder
Bangun form dari JSON schema.

#### F-15: SSR-safe Mode
Dukungan untuk render di server (Node.js) tanpa error.

---

## 3. Area Perbaikan (Technical Debt)

**Ini checklist teknis di balik §0 (Definisi `v1.0.0`) — status per item di-track di sini, bukan di §0.**

### 3.1 Struktur Repo
| Isu | Rekomendasi | Status |
|---|---|---|
| Folder `compossables` (typo) | Rename ke `composables` | ✅ Selesai |
| Tidak ada `tests/` | Tambah Vitest (+ Playwright) | 🟡 Vitest jalan (`npm test`, 97 test), tapi baru helper fondasi (`core`, `helpers/base`, `helpers/guard`, `helpers/dataSource`, registry, `lkDialog`, `Look.state`) — ~49 file component/composable belum ada test sama sekali. Playwright belum disentuh |
| Tidak ada `docs/` | Pisah dari README, pakai VitePress | 🟡 `docs/` sudah ada (70 halaman HTML tangan, termasuk `interactive-cookbook.html` sebagai playground), README cuma pointer — tapi tetap statis, bukan VitePress |
| Tidak ada `CHANGELOG.md` | Pakai Conventional Commits + auto-generate | ✅ `CHANGELOG.md` ada & terawat (manual, bukan auto-generate dari commit) |
| Tidak ada `CONTRIBUTING.md` | Wajib kalau mau open contribution | ❌ Belum ada |

### 3.2 Code Quality
| Item | Status |
|---|---|
| ESLint + Prettier konsisten | ❌ Belum ada config sama sekali |
| Type checking via JSDoc + `tsc --checkJs` | 🟡 JSDoc sudah rapat di hampir semua factory, tapi `tsc --checkJs` tidak pernah dijalankan/di-enforce |
| Bundle size budget (mis. max 30KB gzip untuk core) | ❌ Jauh meleset — `dist/look.min.js` gzip ≈ 155KB, `look.min.css` gzip ≈ 39KB. Bukan cuma soal angka: tiap file component punya side effect top-level (`lkI18n.define(...)`), jadi satu bundle `src/js/index.js` → satu `dist/look.js`, tidak ada entry point per-komponen |
| Tree-shakeable — pastikan export modular | ❌ Terhambat oleh isu di atas (side effects + single entry point) |
| Zero dependencies | ✅ Masih terjaga — `package.json` tidak punya runtime dependency |

### 3.3 Developer Experience
| Item | Status |
|---|---|
| CDN build di unpkg/jsdelivr | ✅ Field `unpkg`/`jsdelivr` sudah di `package.json`; otomatis aktif sejak `0.3.0` live di npm |
| Playground interaktif (dogfooding) | 🟡 `docs/interactive-cookbook.html` sudah mengarah ke sini, belum didedikasikan sepenuhnya sebagai "playground" terpisah |
| CodeSandbox templates untuk quick start | ❌ Belum ada |
| Migration guide antar versi | ✅ `docs/migration.html` ada dan dirawat (shim 0.3 yang dihapus, dsb) |

### 3.4 API Consistency
| Item | Status |
|---|---|
| Audit semua komponen: `el`/`id`/`hidden`/`enabled`/`destroy()` ada di semua | ✅ Seragam lewat `applyBase` (`helpers/base.js`); `destroy()` sekarang juga idempoten di semua komponen `applyBase`-based |
| Standarkan naming option (`onX` vs `onXxx`) | ✅ Dibekukan sejak `0.3.0` — lihat `CLAUDE.md` §0 (callback convention) |
| Dokumentasikan lifecycle komponen (init → ready → destroy) | 🟡 Konvensinya terdokumentasi tersebar di `CLAUDE.md` §0/§0b/§1-3, tapi belum ada satu halaman "lifecycle" yang eksplisit untuk konsumen library |

---

## 4. Strategi Monetisasi & Lisensi

### 4.1 Model yang Direkomendasikan: **Open Core**

```
┌─────────────────────────────────────────────┐
│  LookUI Community (MIT / Apache 2.0)        │
│  ├── Core utilities                         │
│  ├── Semua komponen dasar                   │
│  ├── Composables                            │
│  └── lkDataSource (basic)                   │
├─────────────────────────────────────────────┤
│  LookUI Pro (Commercial License)            │
│  ├── Data Grid Pro                          │
│  ├── Scheduler / Calendar                   │
│  ├── Chart                                 │
│  ├── Form Builder                           │
│  ├── Priority support                       │
│  └── Private issue tracker                  │
└─────────────────────────────────────────────┘
```

### 4.2 Perbandingan Model Lisensi

| Model | Kelebihan | Kekurangan | Cocok Untuk |
|---|---|---|---|
| **MIT / Apache 2.0** | Adopsi maksimal, komunitas luas | Tidak ada revenue langsung | Core library |
| **Open Core** | Revenue + adopsi seimbang | Perlu disiplin memisahkan fitur | **Rekomendasi utama** |
| **Dual License** (GPL + Commercial) | Revenue dari enterprise | Menakutkan sebagian user | Tools enterprise |
| **Fair Source** (delayed open) | Revenue awal, jadi open nanti | Kompleks, kurang dikenal | Produk niche |
| **BSL (Business Source License)** | Proteksi dari kompetitor | Bukan open source sesungguhnya | Produk komersial |
| **SaaS-only** | Revenue recurring | Butuh infra & marketing | Kalau ada hosted offering |

### 4.3 Struktur Lisensi yang Saya Sarankan

#### Untuk Core (Community Edition)
**MIT License** — maksimalkan adopsi. Ini "hook" Anda.

```
MIT License
Copyright (c) 2026 Bambang Y
```

#### Untuk Pro (Commercial)
**Custom Commercial License:**

```
LookUI Pro License v1.0

1. GRANT OF LICENSE
   Anda boleh menggunakan LookUI Pro dalam unlimited project,
   baik internal maupun komersial, untuk 1 organisasi.

2. RESTRICTIONS
   - Tidak boleh redistribute sebagai library/komponen standalone
   - Tidak boleh menjual sebagai bagian dari template/boilerplate
   - Tidak boleh digunakan untuk membangun kompetitor LookUI

3. SUPPORT
   - Priority email support (48 jam response)
   - Akses ke private repository
   - Update gratis selama 12 bulan

4. PRICING TIERS
   - Solo developer: $99/tahun
   - Team (≤10 dev): $499/tahun
   - Enterprise (unlimited): $1,999/tahun
   - Perpetual (versi saat beli, tanpa update): $299 sekali bayar
```

### 4.4 Alternatif: Dual License dengan Fair Source

Kalau Anda ingin **semua kode tetap bisa dilihat publik** tapi tetap monetisasi:

**Pendekatan:**
- Source code di GitHub publik
- Lisensi: **BSL 1.1** — bebas untuk non-production & development, tapi butuh lisensi komersial untuk production use (kecuali untuk proyek open source)
- Setelah 4 tahun, otomatis jadi MIT (delayed open source)

**Contoh yang berhasil:** HashiCorp (sebelumnya), Sentry, MariaDB.

**Kelebihan:** Transparansi penuh, komunitas bisa kontribusi, revenue dari enterprise.
**Kekurangan:** Butuh edukasi pasar, sering disalahpahami sebagai "bukan open source".

### 4.5 Pricing Psychology

| Tier | Harga | Target | Fitur |
|---|---|---|---|
| **Free** | $0 | Indie, hobbyist, open source | Core + Pro basic |
| **Solo** | $99/tahun | Freelancer | + Data Grid Pro, priority support |
| **Team** | $499/tahun | Startup, agency | + Scheduler, Chart, 10 dev |
| **Enterprise** | $1,999+/tahun | Korporasi | + Form Builder, unlimited, SLA |
| **Perpetual** | $299 sekali | Yang anti-subscription | Versi saat beli |

**Tips pricing:**
- Sediakan **tier perpetual** — banyak developer benci subscription
- Diskon **50% untuk negara berkembang** (PPP pricing) — bisa pakai [ParityDeals](https://paritydeals.com)
- Diskon **startup** (≤2 tahun, ≤$1M revenue) — 50% off
- **Free untuk open source project** (non-komersial)

### 4.6 Channel Monetisasi Tambahan

| Channel | Estimasi Revenue | Effort |
|---|---|---|
| **Pro license** | $2K-20K/tahun (tahap awal) | Sedang |
| **Sponsorship GitHub** | $100-1K/bulan | Rendah |
| **Jual template** (LookUI-based) | $500-5K/tahun | Sedang |
| **Konsultasi integrasi** | $50-150/jam | Rendah (tapi tidak scalable) |
| **Course** (Udemy/self-hosted) | $1K-10K/tahun | Tinggi |
| **Support contract** | $5K-50K/tahun | Sedang |
| **Custom component** (on-demand) | $500-5K/proyek | Sedang |

### 4.7 Yang HARUS Dihindari

- ❌ **Relicense mundur** — jangan ubah MIT ke proprietary untuk versi yang sudah dirilis. Ini menghancurkan kepercayaan.
- ❌ **License key enforcement yang agresif** — untuk library JS, ini hampir tidak mungkin dan bikin frustrasi.
- ❌ **Closed source total** — Anda kehilangan keunggulan utama: trust & auditability.
- ❌ **GPL untuk core** — akan menghalangi adopsi komersial.
- ❌ **Pricing terlalu murah** — $9/tahun kelihatan tidak serius. Mulai dari $99.

### 4.8 Rekomendasi Final

**Untuk LookUI, saya sarankan:**

1. **Core: MIT** — maksimalkan adopsi & kontribusi
2. **Pro: Commercial license** — fitur advance (grid, scheduler, chart)
3. **Fair Source untuk Pro** — source terlihat, tapi butuh lisensi untuk production
4. **PPP pricing** — jangkau developer Indonesia & negara berkembang
5. **Jangan kunci API** — fokus pada value fitur, bukan enforcement

---

## 5. Roadmap Eksekusi

> Fase 1 di bawah ini = fondasi fitur (F-01..F-04) + sebagian §3. **Gate aktual untuk `v1.0.0` adalah checklist
> §0**, bukan Fase 1 saja — lihat tabel **"Milestone versi menuju `v1.0.0`"** tepat di bawah Fase 1 untuk urutan
> rilis `0.5.0` → `1.0.0` per-tema, dan §3 untuk status detail tiap item teknis. Semua yang di luar tabel itu
> (Fase 3/4, sisa Fase 2 lama) resmi **post-1.0**.

### Fase 1: Fondasi (Bulan 1-3)
- [x] Rename `compossables` → `composables`
- [x] Setup testing (Vitest) — `test/` covers core, base, guard, dataSource, auto-dispose registry; Playwright and component/composable coverage still pending
- [x] Implementasi `Look.state` (F-01) — `helpers/state.js`: `set/get/patch/subscribe/reset/snapshot+restore/namespace/bindDataSource`, Proxy-backed `state.data`. (Dependency-tracking seperti Vue/MobX sengaja tidak dibuat — key-based pub/sub sudah cukup untuk use case yang disebut di dokumen ini; auto-tracking adalah scope terpisah kalau benar-benar dibutuhkan nanti.)
- [x] Upgrade popup ke Promise-based (F-02) — `lkDialog`'s `api` is now thenable (`await Look.lkDialog({...}).open()`) plus `api.channel` for two-way comms; `lkModal` stays sync-only (markup-bound toggle, doesn't fit the "open and await a result" shape)
- [x] Implementasi auto-dispose (F-03) — `Look.autoDispose(true)` / `disposeAll()` / `disposeWithin()`, `helpers/registry.js`
- [x] Audit API consistency — superseded/covered by the 0.3.0 callback convention + `helpers/guard.js` + `helpers/i18n.js` (see CLAUDE.md §0/§0b)

### Milestone versi menuju `v1.0.0`

Sejak batch fitur 0.4 ini sudah lengkap dan lolos `npm test` + `npm run build` + `npm run test:smoke`, sisa jalan ke
1.0 bukan lagi soal fitur — murni soal menutup checklist §0/§3 satu per satu. Tiap versi di bawah = satu tema, supaya
tiap rilis tetap bisa dipakai (dogfooding) sambil checklist jalan, bukan menunggu semuanya kelar sekaligus.

| Versi | Tema | Scope keluar dari §3 | "Selesai" kalau |
|---|---|---|---|
| **`v0.4.0`** (sekarang) | Rilis fitur | Commit batch 148 file, bump versi, tanggal-kan `CHANGELOG.md`, publish | `npm test`/`build`/`test:smoke` hijau (✅ sudah), rilis live di npm |
| **`v0.5.0`** | Test coverage | 3.1 (`tests/` penuh) | Setiap komponen (26) & composable (23) punya minimal 1 test: construct → interaksi dasar → `destroy()` tanpa error. `ci.yml` jalankan `npm test` sebagai gate (bukan cuma `build`+`test:smoke`) |
| **`v0.6.0`** | Tooling & types | 3.2 (ESLint/Prettier/Stylelint, type checking), 3.1 (`CONTRIBUTING.md`) | ESLint + Stylelint terpasang & lolos di seluruh repo; `.d.ts` untuk public API; `CONTRIBUTING.md` ada |
| **`v0.7.0`** | Bundle architecture | 3.2 (bundle size budget, tree-shakeable) | Side effect top-level (`lkI18n.define()` dkk) tidak lagi memaksa seluruh bundle ikut; budget gzip baru ditentukan berdasarkan ukuran nyata lalu di-enforce di CI (bukan asumsi lama 30KB yang sudah jauh meleset) |
| **`v0.8.0`** | Aksesibilitas & docs hygiene | §0 (audit aksesibilitas), 3.3 (playground, migration guide — sudah ada, dirapikan) | Audit a11y selesai untuk dialog/popup/semua komponen interaktif, temuan diperbaiki; `docs/interactive-cookbook.html` eksplisit jadi playground |
| **`v0.9.0` (release candidate)** | Proof + stabilisasi | Fase 2 lama: F-04 (contoh integrasi MVC nyata) | Minimal satu contoh app .NET MVC (atau PHP) nyata terbukti bekerja; re-audit konsistensi API (3.4) setelah semua perubahan 0.5–0.8; tag `v1.0.0-rc.1` kalau tidak ada regresi |
| **`v1.0.0`** | Stable | — | Semua item §0 tercentang; tidak ada drift published vs current |

Fase 2 lama (contoh app PHP tambahan, VitePress docs, landing page formal) yang tidak masuk tabel di atas tetap
berlaku sebagai **post-1.0**, sama seperti Fase 3/4 (Pro tier, monetisasi) — lihat bagian itu di bawah.

### Fase 2 (lama, untuk referensi — sebagian sudah dipecah ke tabel milestone di atas)
- [ ] Contoh app .NET MVC lengkap (F-04) — lihat `v0.9.0` di tabel milestone
- [ ] Contoh app PHP
- [x] Publish ke npm + CDN — `@lookui/core@0.3.0` live di npm (`unpkg`/`jsdelivr` di `package.json` otomatis ikut aktif); `0.4.0` masih menyusul
- [ ] Setup VitePress docs
- [ ] Landing page (dogfooding) — `docs/index.html` + `docs/interactive-cookbook.html` sudah jadi versi informalnya

### Fase 3: Pro Foundation (Bulan 7-9)
- [ ] Pisahkan core vs pro di struktur repo
- [ ] Implementasi Data Grid Pro
- [ ] Setup license key system (opsional, soft)
- [ ] Pricing page & checkout (LemonSqueezy/Paddle)

### Fase 4: Scale (Bulan 10-12)
- [ ] Scheduler / Calendar
- [ ] Chart
- [ ] Launch di Product Hunt, Hacker News
- [ ] Content marketing (blog, YouTube)

---

## 6. Metrik Keberhasilan

| Metrik | Target 6 Bulan | Target 12 Bulan |
|---|---|---|
| GitHub stars | 500 | 2,000 |
| npm downloads/bulan | 5,000 | 50,000 |
| Pro customers | 5 | 50 |
| MRR | $200 | $2,000 |
| Contributors | 3 | 10 |
| Bundle size (core, gzip) | <30KB | <30KB |

---

## 7. Catatan Penutup

LookUI punya **fondasi yang solid** dan **positioning yang tajam**. Yang membedakan library yang sukses dari yang tenggelam bukan fitur — tapi **cerita, bukti, dan konsistensi**.

Tiga hal yang paling menentukan:
1. **Contoh MVC nyata** — buktikan klaim "MVC-friendly"
2. **State layer** — lengkapi fondasi untuk komposisi
3. **Komunitas** — invest di docs, playground, dan responsif terhadap issue

Monetisasi adalah **konsekuensi**, bukan tujuan. Kalau core-nya bagus dan adopsinya tumbuh, revenue akan mengikuti.

---

*Dokumen ini bersifat hidup — update seiring perkembangan proyek.*
*Versi: 1.0 | Terakhir diperbarui: 2026-10-03*