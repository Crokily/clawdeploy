"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface DashboardLayoutProps {
  children: ReactNode;
}

interface NavigationItem {
  label: string;
  href: string;
  external?: boolean;
}

const navigationItems: NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Create Instance", href: "/dashboard/new" },
  { label: "Documentation", href: "https://github.com/clawcloud", external: true },
];

function mergeClasses(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const isItemActive = (item: NavigationItem): boolean => {
    if (item.external) {
      return false;
    }

    if (item.href === "/dashboard") {
      return pathname === item.href;
    }

    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-primary-50 via-white to-secondary-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.14),_transparent_40%)]" />

      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/60 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="group inline-flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-gradient-to-r from-primary-500 to-accent-500 shadow-soft transition-transform duration-200 group-hover:scale-125" />
            <span className="text-lg font-semibold tracking-tight text-secondary-900">
              ClawDeploy Console
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <p className="hidden text-xs font-medium uppercase tracking-[0.2em] text-secondary-500 sm:block">
              Dashboard
            </p>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-9 w-9 ring-2 ring-primary-100",
                },
              }}
            />
          </div>
        </div>
      </header>

      <div className="relative mx-auto flex max-w-7xl gap-6 px-4 pb-8 pt-20 sm:px-6 lg:px-8">
        <aside className="sticky top-24 hidden h-fit w-64 rounded-2xl border border-white/70 bg-white/70 p-4 shadow-soft backdrop-blur-xl md:block">
          <nav className="space-y-1">
            {navigationItems.map((item) => {
              const isActive = isItemActive(item);

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noreferrer" : undefined}
                  className={mergeClasses(
                    "block rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary-100 text-primary-800 shadow-sm"
                      : "text-secondary-600 hover:bg-secondary-100 hover:text-secondary-900",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="w-full min-w-0 space-y-5">
          <nav className="flex gap-2 overflow-x-auto rounded-xl border border-secondary-200 bg-white/75 p-2 backdrop-blur md:hidden">
            {navigationItems.map((item) => {
              const isActive = isItemActive(item);

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noreferrer" : undefined}
                  className={mergeClasses(
                    "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200",
                    isActive
                      ? "bg-primary-100 text-primary-800"
                      : "text-secondary-600 hover:bg-secondary-100 hover:text-secondary-900",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div>{children}</div>
        </main>
      </div>
    </div>
  );
}
