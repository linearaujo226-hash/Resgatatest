import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resgata+",
  description: "Organize suas dívidas. Recupere seu controle.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
