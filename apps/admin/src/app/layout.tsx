import type { Metadata } from "next";
import "./globals.css";
import AuthGate from "@/components/AuthGate";

export const metadata: Metadata = {
  title: "Wain Admin — Map Builder",
  description: "Indoor navigation map builder",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
