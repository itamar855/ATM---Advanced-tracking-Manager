import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { StoreProvider } from "@/contexts/StoreContext";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ATM — Advanced Tracking Manager",
  description:
    "Plataforma avançada de tracking e rastreamento de campanhas Meta Ads para Shopify. Maximize seu ROAS com tracking server-side preciso.",
  keywords: [
    "tracking",
    "meta ads",
    "facebook ads",
    "shopify",
    "CAPI",
    "conversions API",
    "rastreamento",
    "campanhas",
    "ROAS",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <StoreProvider>
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
