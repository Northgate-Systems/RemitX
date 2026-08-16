import type { Metadata } from "next";
import "./globals.css";
import CookieBanner from "@/components/CookieBanner";
import Analytics from "@/components/Analytics";

export const metadata: Metadata = {
  title: {
    default: "RemitX | Send Money Smarter, Cheaper, Faster",
    template: "%s | RemitX",
  },
  description: "RemitX leverages the Stellar Network to deliver instant cross-border settlements with lower fees than traditional banking.",
  keywords: ["remitx", "stellar", "cross-border payments", "remittance", "send money", "blockchain payments", "stablecoin"],
  authors: [{ name: "RemitX" }],
  creator: "RemitX",
  publisher: "RemitX",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://remitx.app",
    siteName: "RemitX",
    title: "RemitX | Send Money Smarter, Cheaper, Faster",
    description: "RemitX leverages the Stellar Network to deliver instant cross-border settlements with lower fees than traditional banking.",
    images: [
      {
        url: "/image/Remitx.png",
        width: 1200,
        height: 630,
        alt: "RemitX - Send Money Smarter, Cheaper, Faster",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RemitX | Send Money Smarter, Cheaper, Faster",
    description: "RemitX leverages the Stellar Network to deliver instant cross-border settlements with lower fees than traditional banking.",
    images: ["/image/Remitx.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  metadataBase: new URL("https://remitx.app"),
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <head>
        {/* Explicit favicon to override Vercel default */}
        <link rel="icon" href="/favicon.png" sizes="any" />
        <link rel="shortcut icon" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/favicon.png" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body-md text-on-background bg-background min-h-screen antialiased">
        {children}
        <CookieBanner />
        <Analytics />
      </body>
    </html>
  );
}