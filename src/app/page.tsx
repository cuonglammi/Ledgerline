import Link from "next/link";
import { FileCheck2, Mail, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/logo";

const features = [
  {
    icon: Mail,
    title: "Forward it, forget it",
    body: "Email or drop in a PDF or photo. Ledgerline reads the vendor, line items, totals and due date.",
  },
  {
    icon: FileCheck2,
    title: "Catch costly mistakes",
    body: "Checks every invoice against the purchase order and what was delivered, and flags duplicates.",
  },
  {
    icon: ShieldCheck,
    title: "Approve with confidence",
    body: "Approval rules by amount or vendor, a full audit trail, and one-click export to your books.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost" })}>
            Sign in
          </Link>
          <Link href="/sign-up" className={buttonVariants()}>
            Get started
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4">
        <section className="py-20 text-center sm:py-28">
          <p className="mb-4 text-sm font-medium text-muted-foreground">Accounts payable on autopilot</p>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Stop typing invoices into QuickBooks.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
            Ledgerline turns the invoices in your inbox into checked, approved, ready-to-export bills, so
            your bookkeeper reviews instead of retypes.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
              Create a free workspace
            </Link>
          </div>
        </section>

        <section className="grid gap-6 pb-24 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border p-6">
              <Icon className="mb-4 size-5 text-muted-foreground" aria-hidden />
              <h2 className="font-medium">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Ledgerline, a portfolio project
      </footer>
    </div>
  );
}
