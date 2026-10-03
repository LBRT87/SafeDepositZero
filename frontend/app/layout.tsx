import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono, Newsreader } from "next/font/google";
import { DemoBanner, NetworkBanner } from "@/components/demo-banner";
import { Footer } from "@/components/footer";
import { Providers } from "@/components/providers";
import { MobileRoleNav, TopBar } from "@/components/top-bar";
import "./globals.css";

const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], weight: ["500", "600"] });
const hanken = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: "SafeDeposit Zero — Move in without a big deposit",
  description:
    "Pay a small monthly fee instead of a security deposit. Your landlord stays protected by an on-chain guarantee pool on Arbitrum.",
  openGraph: {
    title: "SafeDeposit Zero — Move in without a big deposit",
    description:
      "Pay a small monthly fee instead of a security deposit. Your landlord stays protected by an on-chain guarantee pool on Arbitrum.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${newsreader.variable} ${hanken.variable} ${jetbrains.variable} antialiased`}>
      <body className="flex min-h-screen flex-col">
        <Providers>
          <TopBar />
          <DemoBanner />
          <NetworkBanner />
          <main className="flex-1">{children}</main>
          <Footer />
          <MobileRoleNav />
        </Providers>
      </body>
    </html>
  );
}
