import type { Metadata } from "next";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { wagmiAdapter } from "@/lib/appkit-config";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wayne State NFT Pricing Study",
  description:
    "Wallet verification for an IRB-approved academic study on NFT pricing.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const headersObj = await headers();
  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig,
    headersObj.get("cookie"),
  );

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-neutral-900">
        <Providers initialState={initialState}>
          <main className="flex-1">{children}</main>
        </Providers>
        <footer className="text-xs text-neutral-500 px-4 py-6 text-center border-t border-neutral-200">
          Conducted by researchers at Wayne State University. IRB-approved.
          Contact{" "}
          <a className="underline" href="mailto:irbquestions@wayne.edu">
            irbquestions@wayne.edu
          </a>{" "}
          for questions about your rights as a research participant.
        </footer>
      </body>
    </html>
  );
}
