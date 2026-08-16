import { Geist, Geist_Mono, Inter, Playfair_Display } from "next/font/google";
import Link from "next/link";
import type { Metadata } from "next";
import { BACKEND_ORIGIN } from "@/configurations/backend";
import { cn } from "@/lib/utils";
import "./globals.css";

const playfairDisplayHeading = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-heading",
});

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Argus Dashboard",
  description: "Registration analytics dashboard for Argus",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "dark",
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable,
        playfairDisplayHeading.variable,
      )}
    >
      <body className="flex min-h-full flex-col">
        <nav className="flex items-center gap-6 border-b border-border px-6 py-4 text-sm">
          <Link href="/" className="font-heading text-base font-semibold">
            Argus
          </Link>
          <Link
            href="/webhook-logs"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Webhook Logs
          </Link>
          <a
            href={`${BACKEND_ORIGIN}/dashboard/logout`}
            className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
          >
            Logout
          </a>
        </nav>
        <main className="mx-auto w-full max-w-4xl flex-1 p-8">{children}</main>
      </body>
    </html>
  );
}
