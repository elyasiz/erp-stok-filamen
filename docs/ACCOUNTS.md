# Akun staf TIDIGO

Aplikasi menggunakan email dan kata sandi yang disimpan di database PostgreSQL Neon. Tidak membutuhkan penyedia login eksternal. Email menjadi identitas akun internal; tidak ada pendaftaran publik atau pengiriman email otomatis.

## Aktivasi pertama

1. Buat kode acak minimal 32 karakter, lalu simpan sebagai `AUTH_SETUP_TOKEN` di Vercel. Pertahankan `DATABASE_URL` yang sudah ada. Nilai asli kode tidak boleh masuk ke Git.
2. Terbitkan versi aplikasi ini.
3. Buka website dengan fragmen privat `/#setup=KODE_AKTIVASI`, atau masukkan kode pada formulir aktivasi. Fragmen tidak dikirim sebagai URL permintaan ke server. Aplikasi menghapusnya dari bilah alamat setelah mengisi formulir.
4. Pemilik mengisi nama, email pilihan sendiri, dan kata sandi pribadi 12–128 karakter.
5. Setelah Owner pertama terbentuk, aktivasi ditutup secara atomik dan kode tidak dapat dipakai kembali. Boleh menghapus variabel tersebut dari hosting sesudah aktivasi.

Pratinjau sebaiknya menggunakan database terpisah. Jika pratinjau dan produksi memakai database yang sama, keduanya juga berbagi akun dan status aktivasi.

## Penggunaan sehari-hari

- Masuk menggunakan email dan kata sandi. Alamat email tidak harus Gmail.
- Owner menambahkan nama, email, peran, dan kata sandi sementara lewat **Pengguna & hak akses**.
- Owner menyampaikan kredensial sementara kepada staf secara pribadi. Website tidak mengirim email.
- Staf wajib mengganti kata sandi sementara sebelum dapat mengakses data.
- Semua pengguna dapat mengubah kata sandi sendiri melalui profil dengan memasukkan kata sandi saat ini.
- Jika staf lupa kata sandi, Owner memasukkan kata sandi sementara baru pada editor pengguna. Sesi lama dicabut dan staf wajib menggantinya lagi.
- Untuk akun Owner sendiri, gunakan menu profil. Jika satu-satunya Owner lupa kata sandi, pemulihan perlu dibantu pengelola database; tidak ada tombol reset email otomatis.
- Menonaktifkan akun menghentikan akses tanpa menghapus transaksinya.

## Hak akses

| Peran | Akses |
| --- | --- |
| Owner | Seluruh operasi, pengelolaan akun/peran, laporan, aktivitas |
| Admin Stok | Penerimaan, stok, penggunaan tim, laporan, aktivitas |
| Coach | Stok tanpa harga, pengambilan atas nama sendiri, riwayat dan penyelesaian sesi sendiri |

Peran dan status Owner dilindungi agar akses pengelolaan tetap tersedia. Owner dapat membuat Owner tambahan. Email akun yang sudah dibuat tidak diedit melalui editor pengguna.

## Penyimpanan dan pembatasan

- Kata sandi di-hash dengan scrypt (N=65536, r=8, p=2), salt acak 16 byte, hasil 64 byte. Nilai asli tidak disimpan, dikirim balik melalui API, atau ditulis ke audit.
- Sesi berlaku 12 jam, memakai cookie HttpOnly, Secure pada produksi, SameSite Strict, dan token acak. Database hanya menyimpan digest token.
- Pengubahan/reset kata sandi mencabut sesi lama. Perubahan peran atau penonaktifan akun juga mencabut sesi.
- Percobaan login dibatasi melalui PostgreSQL: 10 per email dalam 15 menit dan 60 per alamat jaringan dalam 15 menit. Setup dibatasi 10 per jaringan. Pada Vercel digunakan header alamat klien yang ditetapkan platform.
- Pembuatan Owner pertama memerlukan kode aktivasi privat serta klaim tunggal pada database. Pengunjung umum tidak dapat mengambil alih pengaturan awal.
- Semua operasi data memeriksa sesi dan peran di server. Pengguna dengan kata sandi sementara hanya dapat mengganti kata sandi, melihat status sesi, dan keluar.
- Perubahan stok, pemakaian, dan akun tercatat bersama pelaku. Hash kata sandi dan kode aktivasi tidak masuk riwayat aktivitas.
- Data stok dan transaksi lama dipertahankan; nama historis tidak otomatis dicocokkan dengan akun baru.

## Validasi

`pnpm test` menjalankan pengujian PostgreSQL terisolasi menggunakan PGlite: aktivasi privat sekali pakai, hashing, akses anonim, pembatasan peran, kepemilikan sesi, kata sandi sementara, reset, pencabutan sesi, pembatasan login, dan regresi stok/laporan. Pengujian tidak menggunakan database produksi.
