# TIDIGO ERP — Stok Filamen

MVP website responsif untuk melacak setiap spool/refill, sisa gram, barang masuk, pemakaian, biaya, ledger, dan audit stok filamen.

## Fitur yang tersedia pada demo

- Dashboard tindakan dengan KPI stok, penggunaan aktif, stok hampir habis, dan aktivitas.
- Daftar unit filamen dengan pencarian, status, saldo gram, dan landed cost.
- Form barang masuk dan simulasi pembentukan unit serta label barcode.
- Alur mulai penggunaan melalui scanner USB atau input barcode manual.
- Daftar penggunaan aktif.
- Alur penyelesaian penggunaan dengan scan ulang, gram, biaya, dan status otomatis.
- Empat laporan prioritas dan ekspor CSV.
- Inventory ledger append-only.
- Pengguna dan role ERP.
- Pengaturan batas stok dan format label.

Data pada deployment awal adalah data demo. Skema PostgreSQL produksi tersedia di `database/schema.sql` dan dapat dipasang setelah penyedia database dipilih.

## Menjalankan lokal

```bash
pnpm install
pnpm dev
```

Buka `http://localhost:3000`.

## Konfigurasi produksi

Salin `.env.example` menjadi `.env.local`, lalu isi koneksi database, storage private, dan MLS SSO. Jangan memasukkan credential ke Git.

Pilihan database dan rekomendasi ada di `docs/DATABASE_OPTIONS.md`.

## Catatan integrasi MLS

Deployment demo belum mengaktifkan autentikasi MLS karena issuer, client ID, client secret, callback, serta field pembeda siswa/staff belum tersedia. Di produksi, seluruh halaman dan API harus dilindungi server-side, akun siswa ditolak, dan role ERP diperiksa pada setiap mutasi.

