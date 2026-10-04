# LookUI — Feature Plan & Improvement Roadmap

> Dokumen ini adalah cetak biru pengembangan LookUI ke depan, mencakup fitur yang perlu ditambahkan, area perbaikan, dan strategi monetisasi berbasis lisensi.

---

## 1. Ringkasan Eksekutif

**LookUI** adalah library JavaScript & CSS untuk komponen UI dengan pendekatan *imperative, predictable, dan MVC-friendly*. Saat ini sudah memiliki fondasi kuat:
- Core utilities (`qs`, `qsa`, `createElement`, event bus)
- Behaviors (`lkToggleable`, `lkFocusTrap`)
- Element-bound components (button, modal, textbox, dropdown, checkbox, radio, switch, carousel, slider, tooltip, rating, chip, list, pagination, progress, splitter, table)
- Composables (date, dialog, alert, toast, loading, inner loading, ping badge, popup proxy, shimmer, storage)
- Data helper (`lkDataSource`)

**Yang belum ada:** state layer, bridge opener↔popup, auto-dispose, contoh integrasi MVC nyata, dan strategi lisensi untuk monetisasi.

---

## 2. Feature Plan

### 2.1 Fondasi (P0 — Wajib Sebelum v1.0)

#### F-01: State Layer (`Look.state`)
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

#### F-02: Bridge Opener ↔ Popup
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

---

#### F-03: Auto-Dispose
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

---

#### F-04: Dokumentasi Integrasi Server-Side
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

#### F-06: Form Integration Helper
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

#### F-08: Theme System
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

### 3.1 Struktur Repo
| Isu | Rekomendasi |
|---|---|
| Folder `compossables` (typo) | Rename ke `composables` |
| Tidak ada `tests/` | Tambah Vitest + Playwright |
| Tidak ada `docs/` | Pisah dari README, pakai VitePress |
| Tidak ada `CHANGELOG.md` | Pakai Conventional Commits + auto-generate |
| Tidak ada `CONTRIBUTING.md` | Wajib kalau mau open contribution |

### 3.2 Code Quality
- **ESLint + Prettier** konsisten
- **Type checking** via JSDoc + `tsc --checkJs`
- **Bundle size budget** (mis. max 30KB gzipped untuk core)
- **Tree-shakeable** — pastikan export modular
- **Zero dependencies** — jaga ini sebagai selling point

### 3.3 Developer Experience
- **CDN build** di unpkg/jsdelivr
- **Playground interaktif** (bisa pakai LookUI sendiri — dogfooding)
- **CodeSandbox templates** untuk quick start
- **Migration guide** antar versi

### 3.4 API Consistency
- Audit semua komponen: pastikan `el`, `id`, `hidden`, `enabled`, `destroy()` ada di semua
- Standarkan naming option (`onX` vs `onXxx`)
- Dokumentasikan lifecycle komponen (init → ready → destroy)

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

### Fase 1: Fondasi (Bulan 1-3)
- [ ] Rename `compossables` → `composables`
- [ ] Setup testing (Vitest + Playwright)
- [ ] Implementasi `Look.state` (F-01)
- [ ] Upgrade popup ke Promise-based (F-02)
- [ ] Implementasi auto-dispose (F-03)
- [ ] Audit API consistency

### Fase 2: Proof (Bulan 4-6)
- [ ] Contoh app .NET MVC lengkap (F-04)
- [ ] Contoh app PHP
- [ ] Publish ke npm + CDN
- [ ] Setup VitePress docs
- [ ] Landing page (dogfooding)

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