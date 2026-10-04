// Contract errors → plain UI copy.

export type ContractErrorCode =
  | "ReserveTooLow"
  | "ConcentrationTooHigh"
  | "TenantBlocked"
  | "ClaimExists"
  | "InvalidTerm"
  | "PoolUnderwater"
  | "NotRequestOwner"
  | "NotAdmin"
  | "ParamOutOfBounds"
  | "NotLandlord"
  | "NotTenant"
  | "InvalidStatus"
  | "WindowClosed"
  | "WindowNotOpen"
  | "AmountExceedsCoverage"
  | "PremiumNotDue"
  | "CoverageTooHigh"
  | "ZeroAmount"
  | "InvalidPeriods"
  | "StringTooLong"
  | "ReasonRequired"
  | "AmountExceedsClaim"
  | "NotAssignedArbiter"
  | "NotOverdue"
  | "NothingOwed"
  | "AlreadyDefaulted"
  | "PremiumsOutstanding"
  | "SameParty"
  | "InsufficientBalance"
  | "InsufficientAllowance"
  | "EnforcedPause"
  | "NotArbiter"
  | "UserRejected";

const COPY: Record<ContractErrorCode, string> = {
  ReserveTooLow:
    "The pool is below its minimum reserve, so new guarantees are paused. Try again after new deposits.",
  ConcentrationTooHigh:
    "This would put too much of the pool behind one landlord. Guarantee a smaller deposit, or wait for the pool to grow.",
  TenantBlocked:
    "This wallet has an unpaid or defaulted debt with the pool, so it can't take a new guarantee until it's repaid.",
  ClaimExists: "A claim was already filed on this lease. Each lease allows one claim.",
  InvalidTerm: "Leases are 6 or 12 months.",
  PoolUnderwater: "Open claims are larger than the pool's free assets right now, so deposits are paused until they settle.",
  NotRequestOwner: "Only the investor who queued this withdrawal can cancel it.",
  NotAdmin: "Only the protocol admin can change this.",
  ParamOutOfBounds: "That value is outside the range the contract allows.",
  NotLandlord: "Only the landlord on this lease can do that.",
  NotTenant: "Only the tenant on this lease can do that.",
  InvalidStatus: "This lease has moved on since you opened the page. Refresh to see its current status.",
  WindowClosed: "The deadline for this step has passed.",
  WindowNotOpen: "It's too early for this step. Wait for the countdown to finish.",
  AmountExceedsCoverage: "The claim can't be more than the guaranteed deposit.",
  PremiumNotDue: "Every monthly fee on this lease is already paid.",
  CoverageTooHigh: "The deposit to guarantee is above the 10,000 USDG limit per lease.",
  ZeroAmount: "Enter an amount above zero.",
  InvalidPeriods: "Choose a lease length the pool accepts.",
  StringTooLong: "That text is too long. Keep it under 280 characters (property label: 64).",
  ReasonRequired: "Write a short reason. Both sides will see it.",
  AmountExceedsClaim: "You can't approve more than the landlord claimed.",
  NotAssignedArbiter: "This dispute was reassigned to another arbiter.",
  NotOverdue: "No installment is overdue yet.",
  NothingOwed: "Nothing is owed on this claim.",
  AlreadyDefaulted: "This debt is already marked as defaulted.",
  PremiumsOutstanding: "Some monthly fees are unpaid, so the lease can't end normally.",
  SameParty: "The landlord and tenant must be different wallets.",
  InsufficientBalance: "Your wallet doesn't have enough USDG for this.",
  InsufficientAllowance: "Approve USDG first.",
  EnforcedPause: "New guarantees and deposits are paused by the protocol admin.",
  NotArbiter: "Only wallets with the arbiter role can decide disputes.",
  UserRejected: "You rejected the request in your wallet. Nothing was sent.",
};

export function isContractErrorCode(name: string): name is ContractErrorCode {
  return Object.prototype.hasOwnProperty.call(COPY, name);
}

export class ContractError extends Error {
  constructor(
    public readonly code: ContractErrorCode,
    message?: string,
  ) {
    super(message ?? COPY[code]);
    this.name = "ContractError";
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ContractError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Nothing was sent.";
}
