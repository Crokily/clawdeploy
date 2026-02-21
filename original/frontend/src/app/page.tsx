import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-16">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-4">
          Deploy OpenClaw in Under 60 Seconds
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Your personal AI assistant, deployed with one click.
        </p>

        <div className="flex gap-4 justify-center">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg hover:bg-blue-700">
                Get Started
              </button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <Link
              href="/dashboard"
              className="px-8 py-3 bg-blue-600 text-white rounded-lg text-lg hover:bg-blue-700"
            >
              Go to Dashboard
            </Link>
          </SignedIn>
        </div>
      </div>
    </main>
  );
}
