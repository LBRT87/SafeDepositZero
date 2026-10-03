import { LogoMark } from "./brand";
import { contractsFor } from "@/config/contracts";
import { arbitrumSepolia } from "viem/chains";
import { robinhoodTestnet } from "@/config/chains";
import { shortAddress } from "@/lib/format";

const ZERO = "0x0000000000000000000000000000000000000000";

export function Footer() {
  const chains = [
    { name: "Arbitrum Sepolia", set: contractsFor(arbitrumSepolia.id) },
    { name: "Robinhood Chain testnet", set: contractsFor(robinhoodTestnet.id) },
  ];
  return (
    <footer className="mt-24 bg-ink pb-24 text-white md:pb-0">
      <div className="page grid grid-cols-1 gap-10 py-14 md:grid-cols-[1fr_2fr]">
        <div>
          <p className="flex items-center gap-2.5 font-display text-[22px] font-semibold">
            <LogoMark className="size-8" />
            SafeDeposit Zero
          </p>
          <p className="t-small mt-3 text-white/70">SafeDeposit Zero · Built on Arbitrum · Paid in USDG</p>
          <p className="t-small mt-1 text-white/70">Testnet demo. Not financial advice. USDG rewards and T-bill yield are simulated.</p>
          <a
            href="https://github.com/LBRT87/SafeDepositZero"
            className="t-small mt-4 inline-block font-semibold text-white underline-offset-[3px] hover:underline decoration-2"
          >
            GitHub
          </a>
        </div>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          {chains.map(({ name, set }) => (
            <div key={name}>
              <p className="t-label text-white">{name}</p>
              <dl className="t-small mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-white/70">
                {(
                  [
                    ["GuaranteePool", set.guaranteePool],
                    ["PolicyManager", set.policyManager],
                    ["ClaimManager", set.claimManager],
                    ["TenantRegistry", set.tenantRegistry],
                    ["PremiumCalculator", set.premiumCalculator],
                    ["USDG", set.usdg],
                  ] as const
                ).map(([label, addr]) => (
                  <div key={label} className="contents">
                    <dt>{label}</dt>
                    <dd className="t-mono text-white">{addr === ZERO ? "Not deployed yet" : shortAddress(addr)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
