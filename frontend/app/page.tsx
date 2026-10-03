import { Landmark, ShieldCheck, Wallet } from "lucide-react";
import { BrandArc } from "@/components/brand";
import { HowItWorks, LandlordGets, YieldBars } from "@/components/landing/sections";
import { Reveal } from "@/components/landing/motion";
import { PoolBand } from "@/components/pool-band";
import { QuoteWidget } from "@/components/quote-widget";
import { ButtonLink } from "@/components/ui/button";

const LEDGER = [
  { who: "Tenant", puts: "A small monthly fee", gets: "Moves in without locking a deposit" },
  { who: "Landlord", puts: "Nothing extra", gets: "Protection up to the full deposit, paid within minutes on approved claims" },
  { who: "Investor", puts: "USDG into the pool", gets: "Yield from rent fees and treasuries" },
  { who: "SafeDeposit Zero", puts: "Runs the protocol", gets: "25% of each fee" },
];

const FAQ = [
  {
    q: "Do I still pay for damage?",
    a: "Yes. If a claim is approved, the pool pays your landlord first and you repay the pool in installments. Normal wear and tear isn't damage.",
  },
  {
    q: "What if I disagree with a claim?",
    a: "Dispute it with your own photos and a note. A neutral arbiter compares check-in and check-out evidence and decides.",
  },
  {
    q: "What if I don't respond to a claim?",
    a: "If you don't respond before the deadline, the claim is accepted. We'll show the deadline clearly.",
  },
  {
    q: "Where does investor yield come from?",
    a: "Tenant fees, interest from tokenized US treasuries, and repayments of past claims. Nothing comes from minting tokens.",
  },
  {
    q: "What if the pool runs low?",
    a: "The contract stops new guarantees whenever reserves fall below 50% of active coverage, so existing guarantees stay backed.",
  },
  {
    q: "Is this live?",
    a: "It's running on Arbitrum Sepolia and Robinhood Chain testnet with test USDG. Treasury yield is simulated on testnet.",
  },
];

export default function Landing() {
  return (
    <>
      {/* Hero */}
      <section className="page grid grid-cols-1 items-center gap-10 pb-20 pt-12 md:pt-16 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-6 lg:pr-8">
          <h1 className="t-display animate-fade-up">Move in without a big deposit.</h1>
          <p className="t-body-l mt-5 max-w-[34rem] animate-fade-up text-muted [animation-delay:80ms]">
            Keep your cash. Pay a small monthly fee, and your landlord is protected up to the full deposit by a
            guarantee pool anyone can check.
          </p>
          <div className="mt-8 flex animate-fade-up flex-wrap gap-3 [animation-delay:160ms]">
            <ButtonLink href="/tenant" size="lg">
              Get a guarantee
            </ButtonLink>
            <ButtonLink href="/invest" size="lg" variant="secondary">
              Invest in the pool
            </ButtonLink>
          </div>
          <ul className="mt-10 flex animate-fade-up flex-wrap gap-x-6 gap-y-3 border-t border-line pt-6 text-[15px] text-muted [animation-delay:240ms]">
            <li className="flex items-center gap-2 whitespace-nowrap">
              <Wallet className="size-[18px] shrink-0 text-brand-700" strokeWidth={1.75} aria-hidden />
              Keep your deposit cash
            </li>
            <li className="flex items-center gap-2 whitespace-nowrap">
              <ShieldCheck className="size-[18px] shrink-0 text-green-700" strokeWidth={1.75} aria-hidden />
              50% reserve, enforced on-chain
            </li>
            <li className="flex items-center gap-2 whitespace-nowrap">
              <Landmark className="size-[18px] shrink-0 text-brand-700" strokeWidth={1.75} aria-hidden />
              Paid in USDG on Arbitrum
            </li>
          </ul>
        </div>
        <div className="relative animate-fade-up overflow-hidden rounded-panel bg-graphite-800 p-5 pb-28 [animation-delay:120ms] sm:p-10 sm:pb-32 lg:col-span-6">
          <BrandArc draw className="pointer-events-none absolute -bottom-1 -left-1 size-64 sm:size-80" strokeWidth={26} />
          <div className="relative">
            <QuoteWidget />
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="page py-16 md:py-20">
        <h2 className="t-h2 measure">A deposit is a month of rent you can&apos;t use.</h2>
        <p className="t-body-l mt-4 text-muted measure">
          It sits with your landlord for the whole lease. It earns you nothing. And at move-out it often comes back late,
          cut, or not at all.
        </p>
        <Reveal className="mt-10">
        <dl className="grid grid-cols-1 gap-8 border-t border-line pt-8 sm:grid-cols-3">
          <Fact value="1–2 months" label="of rent paid up front" />
          <Fact value="0%" label="earned while it's held" />
          <Fact value="Weeks" label="of back-and-forth at move-out" />
        </dl>
        </Reveal>
      </section>

      {/* How it works */}
      <section className="page py-16 md:py-20">
        <h2 className="t-h2">How a guarantee works</h2>
        <HowItWorks />
      </section>

      {/* What the landlord gets: the certificate itself */}
      <section className="page py-16 md:py-20">
        <LandlordGets />
      </section>

      {/* Who gets what */}
      <section className="page py-16 md:py-20">
        <h2 className="t-h2">Everyone gets what they actually need</h2>
        <Reveal className="mt-8 overflow-hidden rounded-panel border border-line bg-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="h-11 border-b border-line">
                <th scope="col" className="w-[22%] px-5 text-[13px] font-semibold text-muted md:px-6">
                  <span className="sr-only">Party</span>
                </th>
                <th scope="col" className="px-3 text-[13px] font-semibold text-muted">Puts in</th>
                <th scope="col" className="px-5 text-[13px] font-semibold text-muted md:px-6">Gets</th>
              </tr>
            </thead>
            <tbody>
              {LEDGER.map((r) => (
                <tr key={r.who} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-5 py-4 align-top font-semibold md:px-6">
                    {r.who}
                  </th>
                  <td className="px-3 py-4 align-top text-muted">{r.puts}</td>
                  <td className="px-5 py-4 align-top md:px-6">{r.gets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </section>

      {/* For landlords / for investors: two-column text blocks */}
      <section className="page grid grid-cols-1 gap-12 border-t border-line py-16 md:grid-cols-2 md:py-20">
        <div>
          <h2 className="t-h2">List with $0 deposit. Stay fully covered.</h2>
          <p className="mt-4 text-muted measure">
            Units with no upfront deposit rent faster. You&apos;re still protected up to the deposit you set, and approved
            claims are paid straight from the pool.
          </p>
          <ButtonLink href="/landlord" variant="secondary" className="mt-6">
            Create a lease invite
          </ButtonLink>
        </div>
        <div>
          <h2 className="t-h2">Earn from rent, not from token emissions.</h2>
          <p className="mt-4 text-muted measure">
            The pool earns from tenant fees and tokenized US treasuries. Every premium, claim and repayment is on-chain,
            and a minimum reserve is enforced by the contract.
          </p>
          <ButtonLink href="/invest" variant="secondary" className="mt-6">
            See the pool
          </ButtonLink>
        </div>
      </section>

      {/* Where the yield comes from */}
      <section className="page grid grid-cols-1 gap-10 py-16 md:py-20 lg:grid-cols-[1fr_minmax(0,640px)] lg:gap-16">
        <div>
          <h2 className="t-h2">Where the yield comes from</h2>
          <p className="mt-4 text-muted measure">
            Investors earn from rent fees, interest on tokenized US treasuries and USDG partner rewards on idle cash. Claims
            are the cost. Nothing comes from minting tokens, and a first-loss reserve funded by SafeDeposit Zero pays tenant
            defaults before investors do.
          </p>
        </div>
        <YieldBars />
      </section>

      <PoolBand />

      {/* FAQ */}
      <section className="page py-16 md:py-20">
        <h2 className="t-h2">Questions renters and landlords ask</h2>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
                {f.q}
                <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-muted measure">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="t-amount-l nums">{value}</dd>
      <dd className="mt-1 text-muted">{label}</dd>
    </div>
  );
}
