import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "XTouch Config Builder",
  description: "Éditeur visuel de configuration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-100`}>
        <header className="bg-white border-b border-gray-200">
          <nav className="max-w-5xl mx-auto px-4 py-3 flex gap-4">
            <a href="/" className="text-blue-600 hover:underline">Config Builder</a>
            <a href="/state" className="text-blue-600 hover:underline">State</a>
            <a href="/gamepad" className="text-blue-600 hover:underline">Gamepad</a>
          </nav>
        </header>
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
