import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { UserMenu } from "@/components/user-menu";

const nav = [
  { href: "/inbox", label: "Inbox" },
  // Added in later weeks: Approvals, Vendors, Purchase orders, Settings
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <Logo href="/inbox" />
          <nav className="flex items-center gap-4 text-sm">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="text-muted-foreground hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            {/* The user menu reads the session, so it streams in without holding up the page shell. */}
            <Suspense fallback={<div className="h-8 w-40" />}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
