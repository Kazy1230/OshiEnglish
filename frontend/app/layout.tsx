import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "ManaVillage",
  description: "好きなクリエイターと90日間、目標達成まで伴走するメンタープラットフォーム",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        <Footer />
        <ToastProvider />
      </body>
    </html>
  );
}
