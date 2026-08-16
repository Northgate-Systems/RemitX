import type { Metadata } from "next";
import LandingClient from "./landing-client";

export const metadata: Metadata = {
  title: "RemitX | Send Money Smarter, Cheaper, Faster",
  description:
    "RemitX leverages the Stellar Network to deliver instant cross-border settlements with lower fees than traditional banking. Send money globally in seconds.",
  openGraph: {
    title: "RemitX | Send Money Smarter, Cheaper, Faster",
    description:
      "RemitX leverages the Stellar Network to deliver instant cross-border settlements with lower fees than traditional banking.",
    url: "https://remitx.app",
    images: [
      {
        url: "/image/Remitx.png",
        width: 1200,
        height: 630,
        alt: "RemitX - Send Money Smarter, Cheaper, Faster",
      },
    ],
  },
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return <LandingClient />;
}