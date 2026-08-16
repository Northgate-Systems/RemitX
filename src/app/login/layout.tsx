import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to your RemitX account to send money globally over the Stellar Network with lower fees and instant settlement.",
  openGraph: {
    title: "Sign In | RemitX",
    description:
      "Sign in to your RemitX account to send money globally over the Stellar Network.",
    url: "https://remitx.app/login",
    images: [
      {
        url: "/image/Remitx.png",
        width: 1200,
        height: 630,
        alt: "RemitX - Sign In",
      },
    ],
  },
  alternates: {
    canonical: "/login",
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}