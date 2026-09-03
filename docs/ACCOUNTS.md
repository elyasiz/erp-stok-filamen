# Akun staf TIDIGO

Sistem menggunakan Google Identity Services dan PostgreSQL Neon yang sudah dipakai aplikasi. Tidak ada pendaftaran publik. Login hanya diterima untuk akun terdaftar dan aktif. Token Google diverifikasi dengan `jose`; sesi aplikasi berupa cookie HttpOnly dengan token acak yang hanya disimpan sebagai SHA-256 di database. Sesi berlaku 12 jam dan dicabut saat akun dinonaktifkan atau perannya berubah.

## Aktivasi

1. Konfirmasikan email Google untuk Owner pertama.
2. Di Google Auth Platform, buat konfigurasi aplikasi TIDIGO dan OAuth client bertipe **Web application**. Data yang dipakai hanya identitas dasar Google: profil dan email. Aplikasi tidak meminta akses Gmail, Drive, atau data Google lain.
3. Daftarkan **Authorized JavaScript origins**: `https://erp-stok-filamen.vercel.app` dan `http://localhost:3000` untuk pengembangan. Origin pratinjau tambahan harus didaftarkan secara eksplisit. Integrasi memakai callback JavaScript dan POST internal `/api/v1/auth/google`, sehingga tidak menggunakan client secret atau redirect URI OAuth.
4. Tambahkan `GOOGLE_CLIENT_ID` dan `AUTH_OWNER_EMAIL` pada lingkungan Vercel proyek `erp-stok-filamen`. Pertahankan `DATABASE_URL` yang sudah ada. Nilai yang sama diperlukan dalam `.env.local` untuk pengembangan dengan database uji terpisah.
5. Terbitkan setelah konfigurasi tersedia. Jangan mengaktifkan versi dengan login wajib di produksi sebelum Owner dapat masuk.
6. Owner masuk dengan email yang dikonfirmasi, lalu mendaftarkan nama, email, dan peran staf melalui **Pengguna & hak akses**. Berikan URL website kepada staf. Aplikasi tidak mengirim undangan email otomatis.

Login pertama menerima email Gmail atau akun Google Workspace yang kepemilikan emailnya dapat dipastikan oleh Google. Sesudah terhubung, identitas menggunakan Google `sub` yang stabil. Akun Google dengan email pihak ketiga tanpa Workspace tidak otomatis ditautkan berdasarkan `email_verified` saja.

## Hak akses

| Peran | Akses |
| --- | --- |
| Owner | Seluruh operasi, akun, peran, laporan, dan aktivitas |
| Admin Stok | Penerimaan, perubahan stok, penggunaan tim, laporan dan aktivitas; daftar nama aktif untuk memilih pengambil |
| Coach | Stok tanpa biaya, pengambilan untuk diri sendiri, daftar/detail/penyelesaian sesi sendiri |

Owner dapat menambah Owner lain. Peran/status akun Owner dilindungi dari penurunan atau penonaktifan melalui aplikasi. Email akun yang sudah dibuat tidak diedit agar pengaitan identitas tidak berpindah tanpa verifikasi.

## Data dan riwayat

- Tabel tambahan: `app_users`, `app_sessions`, `account_guard`, `audit_events`.
- Kolom penggunaan tambahan: pengambil berdasarkan ID akun, pencatat, penyelesai, dan nama kegiatan. Kolom ditambahkan secara idempotent mengikuti pola inisialisasi database aplikasi yang sudah ada.
- Data lama tetap tersimpan. Nama historis tidak dicocokkan otomatis dengan akun baru. Admin tetap dapat melihat dan menyelesaikan sesi lama.
- Koreksi stok wajib menyertakan alasan. Nilai sebelum/sesudah dan pelaku disimpan atomik bersama perubahan.
- Unit berstatus Digunakan tidak dapat dikoreksi atau dihapus secara manual sebelum sesi diselesaikan.
- Penonaktifan akun tidak menghapus stok atau riwayat transaksi.
- Pembatasan berlaku pada API; menyembunyikan menu hanya menyesuaikan tampilan.

## Validasi

`pnpm test` memeriksa SQL aplikasi dengan PostgreSQL terisolasi melalui PGlite, tanpa mengakses database produksi. Pengujian mencakup akses anonim, hak peran, pemalsuan pengambil, kepemilikan sesi, pencabutan sesi, penolakan lintas origin, verifikasi JWT dengan kunci RSA uji, perubahan stok atomik, dan regresi laporan/penggunaan.

Referensi: [Verifikasi identitas Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [otorisasi OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
