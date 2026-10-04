import Link from "next/link";
import { LogoMark } from "./brand";

const REPO = "https://github.com/LBRT87/SafeDepositZero";

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "For tenants", href: "/tenant" },
      { label: "For landlords", href: "/landlord" },
      { label: "For investors", href: "/invest" },
      { label: "Dispute resolution", href: "/arbiter" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Documentation", href: `${REPO}#readme`, external: true },
      { label: "Source code", href: REPO, external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 bg-ink pb-24 text-white md:pb-0">
      <div className="page grid grid-cols-2 gap-x-6 gap-y-10 pb-12 pt-14 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] md:gap-8">
        <div className="col-span-2 max-w-[320px] md:col-span-1">
          <Link href="/" className="inline-flex items-center gap-2.5 rounded-btn font-display text-[22px] font-semibold">
            <LogoMark className="size-8" />
            SafeDeposit Zero
          </Link>
          <p className="mt-4 text-[15px] leading-6 text-white/70">
            Rental deposit guarantees, backed by a USDG pool whose reserves anyone can check on‑chain.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="t-label text-white">{col.title}</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="footer-link">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="footer-link">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <p className="t-label text-white">Network</p>
          <ul className="mt-4 flex flex-col gap-2.5 text-[15px] leading-6 text-white/55">
            {["Arbitrum Sepolia", "Robinhood Chain testnet"].map((n) => (
              <li key={n} className="flex items-start gap-2">
                <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-brand-500" />
                {n}
              </li>
            ))}
            <li>Settled in USDG</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="page flex flex-col gap-2 py-6 text-[13px] leading-5 text-white/55 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} SafeDeposit Zero. Built on Arbitrum.</p>
          <p className="md:text-right">
            Testnet preview. Not financial advice. T-bill yield and USDG rewards are simulated.
          </p>
        </div>
      </div>
    </footer>
  );
}
