import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getSession } from "@/lib/session";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Floorball Danmark",
  description: "Floorball Danmark",
  icons: {
    icon: "/brand/floorball-danmark.png",
    apple: "/brand/floorball-danmark.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const viewMode = session.selectedViewMode ?? "LIGHT";

  return (
    <html
      lang="da"
      data-view={viewMode}
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-dvh flex flex-col">
          <div className="flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
