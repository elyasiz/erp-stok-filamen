import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "TIDIGO ERP · Stok Filamen",
  description: "Kelola unit, sisa gram, penggunaan, biaya, dan riwayat stok filamen TIDIGO.",
  openGraph: {
    title: "TIDIGO ERP · Stok Filamen",
    description: "Setiap unit, setiap gram, terlacak.",
    type: "website",
    locale: "id_ID",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "TIDIGO ERP Stok Filamen" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TIDIGO ERP · Stok Filamen",
    description: "Setiap unit, setiap gram, terlacak.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

