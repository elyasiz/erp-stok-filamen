# Pilihan Database dan Storage

ERP stok filamen membutuhkan database relasional karena finalisasi barang masuk, pemakaian, saldo unit, ledger, dan audit log harus konsisten dalam satu transaksi. Karena aplikasi di-deploy di Vercel, semua opsi di bawah menggunakan PostgreSQL.

## Opsi A — Neon PostgreSQL + Vercel Blob (rekomendasi utama)

Paling cocok jika prioritasnya adalah deployment Vercel yang sederhana.

- Neon tersedia sebagai integrasi native di Vercel dan menyediakan connection string langsung ke project.
- Database branching cocok untuk preview deployment tanpa menyentuh data produksi.
- Autoscaling dan scale-to-zero cocok untuk MVP dengan trafik yang belum stabil.
- Invoice, nota, dan ekspor disimpan di Vercel Blob private; metadata file tetap berada di PostgreSQL.
- Autentikasi MLS ditangani aplikasi melalui OpenID Connect/OAuth 2.0, tidak dikunci ke penyedia database.

Konsekuensi: autentikasi, role ERP, dan kebijakan akses file harus dibuat di backend aplikasi.

Referensi:

- https://vercel.com/marketplace/neon
- https://neon.com/docs/get-started-with-neon/workflow-primer
- https://vercel.com/docs/vercel-blob/private-storage

## Opsi B — Supabase PostgreSQL + Supabase Storage

Paling cocok jika prioritasnya adalah satu layanan untuk database, autentikasi, dan file.

- Mendapat PostgreSQL penuh, Storage, dashboard data, dan Row Level Security.
- Custom OAuth/OIDC provider dapat dipakai jika MLS menyediakan discovery OIDC atau endpoint OAuth 2.0 yang standar.
- Invoice dan nota dapat disimpan di bucket private dengan kebijakan akses per role.
- Lebih sedikit komponen yang perlu disatukan dibanding Neon + Vercel Blob.

Konsekuensi: integrasi MLS harus diverifikasi lebih dulu. Backup database Supabase tidak otomatis mencakup byte file Storage, sehingga backup file harus direncanakan terpisah.

Referensi:

- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/auth/custom-oauth-providers
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/storage

## Opsi C — PostgreSQL terkelola lain + S3-compatible storage

Paling cocok jika organisasi sudah mempunyai infrastruktur, aturan data residency, atau vendor standar sendiri.

- Bisa menggunakan AWS RDS, Google Cloud SQL, Azure Database for PostgreSQL, Railway, atau penyedia PostgreSQL terkelola lain.
- File menggunakan S3/R2/MinIO sesuai kebijakan organisasi.
- Kontrol paling luas untuk jaringan, backup, retensi, dan observability.

Konsekuensi: setup, biaya operasional, pooling koneksi serverless, backup, dan pemantauan lebih banyak dikelola sendiri.

## Keputusan yang disarankan

Mulai dengan **Neon PostgreSQL + Vercel Blob private** untuk MVP. Struktur SQL di folder `database/` tetap PostgreSQL standar dan dapat dipindahkan ke Supabase atau penyedia PostgreSQL lain.

Sebelum produksi, kunci empat hal:

1. Metode SSO MLS dan field `account_type` untuk menolak siswa.
2. Retensi backup database minimal 30 hari.
3. Backup terpisah untuk file invoice/nota.
4. Region penyimpanan yang sesuai kebijakan organisasi.

