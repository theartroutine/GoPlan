import type { Metadata } from "next";
import "./globals.css";

import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: "GoPlan",
  description: "Plan and achieve your goals",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
