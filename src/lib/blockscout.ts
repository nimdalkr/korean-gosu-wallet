import type {
  NormalizedTransaction,
  NormalizedTransfer,
  TokenMetadata,
  TokenType,
} from "./domain";

type AddressRef = {
  hash?: string | null;
  name?: string | null;
  is_contract?: boolean | null;
} | null;

export interface BlockscoutTokenTransfer {
  block_number?: number | string;
  from?: AddressRef;
  log_index?: number | string;
  index_in_batch?: number | string | null;
  method?: string | null;
  timestamp?: string;
  to?: AddressRef;
  token?: {
    address_hash?: string;
    decimals?: string | number | null;
    icon_url?: string | null;
    name?: string | null;
    symbol?: string | null;
    type?: string | null;
    reputation?: string | null;
  };
  token_type?: string | null;
  total?: {
    decimals?: string | number | null;
    token_id?: string | number | null;
    value?: string | number | null;
  };
  transaction_hash?: string;
}

export interface BlockscoutTransaction {
  block_number?: number | string;
  from?: AddressRef;
  hash?: string;
  method?: string | null;
  result?: string | null;
  status?: string | null;
  timestamp?: string;
  to?: AddressRef;
  value?: string | number | null;
  transaction_types?: string[] | null;
}

export interface BlockscoutInternalTransaction {
  block_number?: number | string;
  error?: string | null;
  from?: AddressRef;
  index?: number | string | null;
  success?: boolean | null;
  timestamp?: string;
  to?: AddressRef;
  transaction_hash?: string;
  type?: string | null;
  value?: string | number | null;
}

export interface BlockscoutPage<T> {
  items: T[];
  next_page_params: Record<string, string | number | boolean> | null;
}

function addressHash(value: AddressRef | undefined) {
  return value?.hash?.toLowerCase() ?? null;
}

function normalizeTokenType(value?: string | null): TokenType {
  const normalized = value?.toUpperCase();
  if (normalized === "ERC-721") return "ERC-721";
  if (normalized === "ERC-1155") return "ERC-1155";
  return "ERC-20";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatRawAmount(rawValue: string, decimals: number | null) {
  if (!/^\d+$/.test(rawValue)) return rawValue;
  if (!decimals || decimals <= 0) return BigInt(rawValue).toString();
  const value = BigInt(rawValue);
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals) || "0";
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function normalizedTransferId(
  item: Pick<
    NormalizedTransfer,
    "walletAddress" | "transactionHash" | "logIndex" | "token" | "tokenId" | "batchIndex"
  >,
) {
  return `${item.walletAddress.toLowerCase()}:${item.transactionHash.toLowerCase()}:${item.logIndex}:${item.token.address.toLowerCase()}:${item.tokenId ?? "fungible"}:${item.batchIndex ?? 0}`;
}

export function normalizeBlockscoutTransfer(
  item: BlockscoutTokenTransfer,
  walletAddress: string,
): NormalizedTransfer | null {
  const wallet = walletAddress.toLowerCase();
  const from = addressHash(item.from);
  const to = addressHash(item.to);
  const transactionHash = item.transaction_hash?.toLowerCase();
  const tokenAddress = item.token?.address_hash?.toLowerCase();
  const blockNumber = numberOrNull(item.block_number);
  const logIndex = numberOrNull(item.log_index);
  const occurredAt = item.timestamp;
  if (
    !from ||
    !to ||
    !transactionHash ||
    !tokenAddress ||
    blockNumber === null ||
    logIndex === null ||
    !occurredAt
  ) {
    return null;
  }
  if (from !== wallet && to !== wallet) return null;

  const tokenType = normalizeTokenType(item.token_type ?? item.token?.type);
  const decimals = numberOrNull(item.total?.decimals ?? item.token?.decimals);
  const rawAmount = String(item.total?.value ?? "1");
  const batchIndex = numberOrNull(item.index_in_batch);
  const tokenId =
    item.total?.token_id === null || item.total?.token_id === undefined
      ? null
      : String(item.total.token_id);
  const token: TokenMetadata = {
    address: tokenAddress,
    name: item.token?.name?.trim() || item.token?.symbol?.trim() || "Unknown token",
    symbol: item.token?.symbol?.trim() || "UNKNOWN",
    decimals,
    type: tokenType,
    iconUrl: item.token?.icon_url ?? null,
    reputation: item.token?.reputation ?? null,
  };

  return {
    id: normalizedTransferId({
      walletAddress: wallet,
      transactionHash,
      logIndex,
      token,
      tokenId,
      batchIndex,
    }),
    walletAddress: wallet,
    transactionHash,
    logIndex,
    blockNumber,
    occurredAt,
    direction: to === wallet ? "in" : "out",
    from,
    to,
    token,
    amount: formatRawAmount(rawAmount, tokenType === "ERC-20" ? decimals : 0),
    rawAmount,
    tokenId,
    batchIndex,
    method: item.method ?? null,
  };
}

export function normalizeBlockscoutTransaction(
  item: BlockscoutTransaction,
  walletAddress: string,
): NormalizedTransaction | null {
  const wallet = walletAddress.toLowerCase();
  const from = addressHash(item.from);
  const to = addressHash(item.to);
  const transactionHash = item.hash?.toLowerCase();
  const blockNumber = numberOrNull(item.block_number);
  const occurredAt = item.timestamp;
  if (!from || !transactionHash || blockNumber === null || !occurredAt) return null;
  if (from !== wallet && to !== wallet) return null;

  const rawValue = String(item.value ?? "0");
  const statusValue = (item.status ?? item.result ?? "").toLowerCase();
  const status = statusValue.includes("error") || statusValue.includes("fail")
    ? "error"
    : statusValue.includes("ok") || statusValue.includes("success")
      ? "ok"
      : "unknown";

  return {
    id: `${wallet}:${transactionHash}`,
    walletAddress: wallet,
    transactionHash,
    blockNumber,
    occurredAt,
    direction: from === wallet ? "out" : "in",
    from,
    to,
    method: item.method ?? null,
    valueEth: formatRawAmount(rawValue, 18),
    status,
    source: "normal",
    toName: item.to?.name ?? null,
    transactionTypes: item.transaction_types ?? [],
  };
}

export function normalizeBlockscoutInternalTransaction(
  item: BlockscoutInternalTransaction,
  walletAddress: string,
): NormalizedTransaction | null {
  const wallet = walletAddress.toLowerCase();
  const from = addressHash(item.from);
  const to = addressHash(item.to);
  const transactionHash = item.transaction_hash?.toLowerCase();
  const blockNumber = numberOrNull(item.block_number);
  const occurredAt = item.timestamp;
  const traceIndex = numberOrNull(item.index) ?? 0;
  if (!from || !transactionHash || blockNumber === null || !occurredAt) return null;
  if (from !== wallet && to !== wallet) return null;
  const rawValue = String(item.value ?? "0");
  const status = item.success === false || item.error
    ? "error"
    : item.success === true
      ? "ok"
      : "unknown";

  return {
    id: `${wallet}:${transactionHash}:internal:${traceIndex}:${from}:${to ?? "contract-create"}`,
    walletAddress: wallet,
    transactionHash,
    blockNumber,
    occurredAt,
    direction: from === wallet ? "out" : "in",
    from,
    to,
    method: item.type ?? null,
    valueEth: formatRawAmount(rawValue, 18),
    status,
    source: "internal",
    toName: item.to?.name ?? null,
    transactionTypes: ["internal_transaction"],
  };
}
