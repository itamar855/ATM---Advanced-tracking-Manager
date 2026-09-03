import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { StoreProvider } from "@/contexts/StoreContext";
import PwaRegister from "@/components/pwa/PwaRegister";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0B0E14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "ATM PRO — Advanced Tracking Manager",
  description:
    "Plataforma avançada de tracking e rastreamento de campanhas Meta Ads para Shopify. Maximize seu ROAS com tracking server-side preciso.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ATM PRO",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
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
      <body className={`${inter.variable} font-sans antialiased bg-[#0B0E14] text-zinc-100`}>
        <StoreProvider>
          <PwaRegister />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
