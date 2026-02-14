import type { Metadata } from "next";
import {
  ClerkProvider,
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ClawDeploy — One-Click OpenClaw Deployment",
    template: "%s | ClawDeploy",
  },
  description:
    "Deploy your own OpenClaw AI assistant instance in under a minute. No Docker or server knowledge required.",
  openGraph: {
    title: "ClawDeploy — One-Click OpenClaw Deployment",
    description: "Deploy your own OpenClaw AI assistant instance in under a minute.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <header className="border-b">
            <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
              <h1 className="text-xl font-bold">ClawDeploy</h1>
              <div>
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                      Sign In
                    </button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <UserButton />
                </SignedIn>
              </div>
            </nav>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
