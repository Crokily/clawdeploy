import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Instance",
};

export default function NewInstanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
