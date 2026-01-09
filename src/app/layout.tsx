import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a12",
};

export const metadata: Metadata = {
  title: "ourfeelings.art — a river of feelings",
  description: "Draw how you feel. Watch the world's emotions flow by.",
  keywords: ["feelings", "emotions", "art", "interactive", "ambient", "meditation"],
  authors: [{ name: "ourfeelings.art" }],
  openGraph: {
    title: "ourfeelings.art — a river of feelings",
    description: "Draw how you feel. Watch the world's emotions flow by.",
    type: "website",
    url: "https://ourfeelings.art",
  },
  twitter: {
    card: "summary_large_image",
    title: "ourfeelings.art — a river of feelings",
    description: "Draw how you feel. Watch the world's emotions flow by.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-[#0a0a12]`}>
        {children}
      </body>
    </html>
  );
}
