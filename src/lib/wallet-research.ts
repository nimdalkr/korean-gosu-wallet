import type {
  ActivityCategory,
  ActivityEvent,
  CohortTheme,
  IntelligenceSignal,
  NormalizedTransaction,
  NormalizedTransfer,
  ResearchConfidence,
  WalletAssetFlow,
  WalletBehaviorSlice,
  WalletCounterparty,
  WalletInterestTopic,
  WalletMomentum,
  WalletNotableMove,
  WalletPersona,
  WalletProtocolInterest,
  WalletResearchDesk,
  WalletResearchProfile,
  WalletSeed,
  WalletStance,
  WalletStrategyCluster,
  WalletTrendPoint,
} from "./domain";

const DAY_MS = 86_400_000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const QUID_ADDRESS = "0x1a44233fae8d50f1aeb3a5d58dd426ff4814cb53";
const PAYMENT_SYMBOLS = new Set(["ETH", "WETH", "USDC", "USDBC", "DAI", "CBBTC"]);
const SIMPLE_METHOD = /^(?:transfer|approve|setapprovalforall|permit)$/i;
const GENERIC_CONTRACT_NAME = /^(?:token|erc20|erc721|erc1155|erc1967proxy|transparentupgradeableproxy|optimizedtransparentupgradeableproxy|erc20fixedsupply)$/i;

const PERSONA_META: Record<WalletPersona, { label: string; description: string }> = {
  active_trader: {
    label: "능동 트레이더",
    description: "결제자산과 위험자산을 함께 움직이며 회전 거래 흔적을 남기는 지갑군",
  },
  token_operator: {
    label: "토큰 운용·정리형",
    description: "여러 토큰의 수신과 직접 전송을 반복하지만 매매 체결로 단정할 수 없는 지갑군",
  },
  defi_operator: {
    label: "DeFi 운용자",
    description: "브리지·스테이킹·유동성 또는 복수 프로토콜을 직접 운용하는 지갑군",
  },
  protocol_explorer: {
    label: "프로토콜 탐색자",
    description: "새로운 컨트랙트와 메서드를 반복적으로 직접 호출하는 지갑군",
  },
  nft_collector: {
    label: "NFT 컬렉터",
    description: "민팅·매수·이동을 통해 NFT 컬렉션에 집중하는 지갑군",
  },
  airdrop_hunter: {
    label: "에어드롭·클레임형",
    description: "다양한 토큰 수령과 직접 클레임 흔적이 함께 나타나는 지갑군",
  },
  accumulator: {
    label: "축적형 지갑",
    description: "최근 자산 유입이 유출보다 우세하고 보유를 유지하는 지갑군",
  },
  distributor: {
    label: "분배·정리형 지갑",
    description: "복수 자산을 외부 주소로 지속적으로 내보내는 지갑군",
  },
  exchange_feeder: {
    label: "거래소 송금형",
    description: "알려진 거래소 핫월렛 방향의 유출이 반복되는 지갑군",
  },
  multi_strategy: {
    label: "멀티전략 지갑",
    description: "토큰·NFT·프로토콜 행동을 한 가지 유형으로 단정하기 어려운 지갑군",
  },
  passive_holder: {
    label: "수동 보유·활동 미확인",
    description: "노이즈 제거 후 직접 선택으로 볼 만한 행동이 없거나 수동 유입 비중이 높은 지갑군",
  },
};

const MOMENTUM_LABELS: Record<WalletMomentum, string> = {
  surging: "활동 급증",
  rising: "관심 확대",
  stable: "기존 패턴 유지",
  cooling: "활동 둔화",
  inactive: "관망·비활성",
};

const STANCE_LABELS: Record<WalletStance, string> = {
  accumulating: "순유입 우세",
  distributing: "순유출 우세",
  rotating: "자산 회전",
  exploring: "신규 프로토콜 탐색",
  monitoring: "선별 관찰",
  inactive: "활동 없음",
};

const SECTOR_RULES: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "AI·데이터",
    pattern: /\b(?:KAITO|FLOCK|OPG|MIRA|OPENAI|ORN|ELSA|VVV|CARV|THQ|O1)\b|open.?gradient|artificial|agent|data|kaito|flock|mira|venice|theoriq|orion/i,
  },
  {
    label: "DeFi·수익화",
    pattern: /\b(?:AERO|UP|EDGE|HOME)\b|aerodrome|superform|definitive|liquidity|staking|yield|swap|lending|vault/i,
  },
  {
    label: "게임·소비자",
    pattern: /\b(?:B3|GG|SIXR)\b|gacha|gaming|game|cricket/i,
  },
  {
    label: "NFT·크리에이터",
    pattern: /\bZORA\b|creator|collectible|edition|mint|erc.?721|erc.?1155/i,
  },
  {
    label: "인프라·모듈러",
    pattern: /\b(?:ICNT|CTR)\b|citrea|chainbase|cloud|bridge|infrastructure|network/i,
  },
  {
    label: "신원·평판",
    pattern: /\b(?:SIGN|TRUST)\b|intuition|identity|attestation|reputation/i,
  },
  {
    label: "밈·커뮤니티",
    pattern: /\b(?:TOSHI|BRETT)\b|meme/i,
  },
];

const SIGNIFICANT_CATEGORIES = new Set<ActivityCategory>([
  "token_buy_candidate",
  "token_sell_candidate",
  "nft_purchase_candidate",
  "nft_sale_candidate",
  "nft_mint",
  "bridge",
  "staking",
  "liquidity",
  "approval",
  "contract_interaction",
]);

const MOVE_REASON: Record<ActivityCategory, string> = {
  airdrop_received: "새 자산 유입이지만 지갑이 직접 선택한 행동인지 추가 확인이 필요합니다.",
  token_buy_candidate: "결제자산 유출과 위험자산 유입이 같은 거래에서 확인된 강한 관심 근거입니다.",
  token_sell_candidate: "위험자산 유출과 결제자산 유입이 함께 나타난 포지션 축소 후보입니다.",
  nft_purchase_candidate: "결제 흐름을 동반한 NFT 취득으로 컬렉션 선호를 보여줍니다.",
  nft_sale_candidate: "NFT 유출과 결제자산 유입이 함께 나타난 회수 행동 후보입니다.",
  nft_mint: "신규 컬렉션에 초기 진입한 직접 행동입니다.",
  token_receive: "단순 수신일 수 있어 반복성·발신자 분산과 후속 행동을 함께 봐야 합니다.",
  token_send: "보유자산을 외부로 이동한 유출 흔적입니다.",
  nft_receive: "NFT 유입이 확인됐지만 매수·민팅 여부는 확정되지 않았습니다.",
  nft_send: "NFT를 외부 주소로 이동해 보유 축소 가능성이 있습니다.",
  bridge: "다른 체인 또는 유동성 경로로 자금을 옮긴 후속 행동의 선행 신호입니다.",
  staking: "단순 보유를 넘어 수익화 또는 거버넌스 참여를 시도한 흔적입니다.",
  liquidity: "유동성 공급·회수로 포지션 운용 깊이를 보여주는 행동입니다.",
  approval: "후속 거래를 위한 사전 승인일 수 있어 다음 호출을 추적할 필요가 있습니다.",
  contract_interaction: "지갑이 직접 특정 컨트랙트를 선택해 호출한 관심 근거입니다.",
};

const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

interface ResearchInput {
  wallets: WalletSeed[];
  activities: ActivityEvent[];
  transfers?: NormalizedTransfer[];
  transactions?: NormalizedTransaction[];
  signals: IntelligenceSignal[];
  generatedAt: string;
}

interface InternalAssetGroup {
  sample: NormalizedTransfer;
  receivedAmount: number;
  sentAmount: number;
  transferCount30d: number;
  transferCount7d: number;
  initiatedActivityCount: number;
  lastSeenAt: string;
  receivedUsd: number;
  sentUsd: number;
  pricedTransfers: number;
  eligibleTransfers: number;
}

interface InternalCounterparty {
  address: string;
  labels: Set<string>;
  inboundCount: number;
  outboundCount: number;
  assets: Set<string>;
  interactions: Set<string>;
  interactions7d: Set<string>;
  lastSeenAt: string;
  estimatedUsd: number;
  pricedCount: number;
  isContract: boolean;
}

interface AssetThemeGroup {
  sample: NormalizedTransfer;
  wallets30d: Set<string>;
  wallets7d: Set<string>;
  initiatedWallets7d: Set<string>;
  top100Wallets7d: Set<string>;
  exchanges7d: Set<string>;
  walletActions7d: Map<string, number>;
  actionCount7d: number;
  priorActionCount: number;
  inboundCount7d: number;
  outboundCount7d: number;
  inboundSources7d: Map<string, number>;
  inboundAmounts7d: Map<string, number>;
  estimatedNetUsd7d: number;
  pricedCount7d: number;
  evidenceUrls: Set<string>;
  lastSeenAt: string;
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function safeNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isAfter(timestamp: string, threshold: number) {
  return Date.parse(timestamp) >= threshold;
}

function shortAddress(address: string) {
  return `${address.slice(0, 7)}…${address.slice(-5)}`;
}

function formatPercent(value: number) {
  if (value > 0 && value < 0.01) return "<1%";
  return `${Math.round(value * 100)}%`;
}

function sectorFor(value: string, nft = false) {
  if (nft) return "NFT·크리에이터";
  for (const rule of SECTOR_RULES) {
    if (rule.pattern.test(value)) return rule.label;
  }
  return "미분류";
}

function sectorForTransfer(transfer: NormalizedTransfer) {
  return sectorFor(
    `${transfer.token.symbol} ${transfer.token.name}`,
    transfer.token.type === "ERC-721" || transfer.token.type === "ERC-1155",
  );
}

function isPaymentTransfer(transfer: NormalizedTransfer) {
  return PAYMENT_SYMBOLS.has(transfer.token.symbol.toUpperCase());
}

function isSpamTransfer(transfer: NormalizedTransfer) {
  if (transfer.token.reputation?.toLowerCase() === "spam") return true;
  return /(?:https?:\/\/|t\.me|claim\s|visit\s|install\s|free\s+mint)/i.test(
    `${transfer.token.name} ${transfer.token.symbol}`,
  );
}

function detectPassiveDistributionAssets(input: {
  transfers: NormalizedTransfer[];
  transactions: NormalizedTransaction[];
}) {
  const initiatedTransactions = new Set(
    input.transactions
      .filter(
        (transaction) =>
          transaction.source === "normal" &&
          transaction.direction === "out" &&
          transaction.status === "ok",
      )
      .map((transaction) => `${transaction.walletAddress}:${transaction.transactionHash}`),
  );
  const groups = new Map<
    string,
    {
      wallets: Set<string>;
      initiatedWallets: Set<string>;
      inboundCount: number;
      inboundSources: Map<string, number>;
      inboundAmounts: Map<string, number>;
    }
  >();
  for (const transfer of input.transfers) {
    const address = transfer.token.address.toLowerCase();
    if (
      address === QUID_ADDRESS ||
      PAYMENT_SYMBOLS.has(transfer.token.symbol.toUpperCase()) ||
      isSpamTransfer(transfer)
    ) {
      continue;
    }
    const current = groups.get(address) ?? {
      wallets: new Set<string>(),
      initiatedWallets: new Set<string>(),
      inboundCount: 0,
      inboundSources: new Map<string, number>(),
      inboundAmounts: new Map<string, number>(),
    };
    current.wallets.add(transfer.walletAddress);
    if (
      transfer.direction === "out" ||
      initiatedTransactions.has(`${transfer.walletAddress}:${transfer.transactionHash}`)
    ) {
      current.initiatedWallets.add(transfer.walletAddress);
    }
    if (transfer.direction === "in") {
      current.inboundCount += 1;
      const source = transfer.from.toLowerCase();
      current.inboundSources.set(source, (current.inboundSources.get(source) ?? 0) + 1);
      const amount = String(round(safeNumber(transfer.amount), 8));
      current.inboundAmounts.set(amount, (current.inboundAmounts.get(amount) ?? 0) + 1);
    }
    groups.set(address, current);
  }

  const passiveAssets = new Set<string>();
  for (const [address, group] of groups) {
    if (group.wallets.size < 3 || group.inboundCount < 3) continue;
    const sourceShare = Math.max(0, ...group.inboundSources.values()) / group.inboundCount;
    const amountShare = Math.max(0, ...group.inboundAmounts.values()) / group.inboundCount;
    const passiveShare = 1 - group.initiatedWallets.size / group.wallets.size;
    if ((sourceShare >= 0.75 || amountShare >= 0.75) && passiveShare >= 0.7) {
      passiveAssets.add(address);
    }
  }
  return passiveAssets;
}

function activityIsMeaningful(activity: ActivityEvent) {
  return !activity.suspectedSpam &&
    (activity.initiatedByWallet || SIGNIFICANT_CATEGORIES.has(activity.category));
}

function knownUsd(transfer: NormalizedTransfer) {
  if (isSpamTransfer(transfer) || transfer.token.type !== "ERC-20") return null;
  const rate = safeNumber(transfer.token.exchangeRateUsd);
  const amount = safeNumber(transfer.amount);
  if (rate <= 0 || amount < 0) return null;
  const value = rate * amount;
  if (!Number.isFinite(value) || value > 1_000_000_000) return null;
  return value;
}

function newestTimestamp(values: string[]) {
  return values.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? "";
}

function oldestTimestamp(values: string[]) {
  return values.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? "";
}

function confidenceForProfile(evidenceCount: number, directTransactions: number): ResearchConfidence {
  if (evidenceCount >= 12 && directTransactions >= 5) return "high";
  if (evidenceCount >= 4 || directTransactions >= 2) return "medium";
  return "low";
}

function confidenceFromEvidence(wallets: number, initiatedWallets: number, exchanges: number): ResearchConfidence {
  if (initiatedWallets >= 3 && exchanges >= 2) return "high";
  if (initiatedWallets >= 1 || wallets >= 3) return "medium";
  return "low";
}

function buildTrend14d(input: {
  activities: ActivityEvent[];
  transfers: NormalizedTransfer[];
  generatedAt: string;
}) {
  const anchor = Date.parse(input.generatedAt);
  const points = new Map<string, WalletTrendPoint>();
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = KST_DATE_FORMATTER.format(new Date(anchor - offset * DAY_MS));
    points.set(date, { date, meaningful: 0, initiated: 0, inbound: 0, outbound: 0 });
  }
  for (const activity of input.activities) {
    const point = points.get(KST_DATE_FORMATTER.format(new Date(activity.occurredAt)));
    if (!point || !activityIsMeaningful(activity)) continue;
    point.meaningful += 1;
    if (activity.initiatedByWallet) point.initiated += 1;
  }
  for (const transfer of input.transfers) {
    if (isSpamTransfer(transfer)) continue;
    const point = points.get(KST_DATE_FORMATTER.format(new Date(transfer.occurredAt)));
    if (!point) continue;
    if (transfer.direction === "in") point.inbound += 1;
    else point.outbound += 1;
  }
  return [...points.values()];
}

function buildBehaviorMix(input: {
  activities: ActivityEvent[];
  threshold7d: number;
}) {
  const groups = new Map<
    ActivityCategory,
    { count30d: number; count7d: number; initiated: number; lastSeenAt: string }
  >();
  for (const activity of input.activities) {
    if (
      activity.suspectedSpam ||
      activity.primaryAsset?.address.toLowerCase() === QUID_ADDRESS
    ) {
      continue;
    }
    const current = groups.get(activity.category) ?? {
      count30d: 0,
      count7d: 0,
      initiated: 0,
      lastSeenAt: activity.occurredAt,
    };
    current.count30d += 1;
    if (isAfter(activity.occurredAt, input.threshold7d)) current.count7d += 1;
    if (activity.initiatedByWallet) current.initiated += 1;
    if (Date.parse(activity.occurredAt) > Date.parse(current.lastSeenAt)) {
      current.lastSeenAt = activity.occurredAt;
    }
    groups.set(activity.category, current);
  }
  const total = [...groups.values()].reduce((sum, value) => sum + value.count30d, 0);
  return [...groups.entries()]
    .map<WalletBehaviorSlice>(([category, value]) => ({
      category,
      count30d: value.count30d,
      count7d: value.count7d,
      initiatedCount30d: value.initiated,
      share: total ? round(value.count30d / total, 3) : 0,
      lastSeenAt: value.lastSeenAt,
    }))
    .sort(
      (a, b) =>
        b.count7d - a.count7d ||
        b.initiatedCount30d - a.initiatedCount30d ||
        b.count30d - a.count30d ||
        Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt),
    );
}

function buildAssetFlows(input: {
  transfers: NormalizedTransfer[];
  activities: ActivityEvent[];
  threshold7d: number;
  passiveDistributionAssets: Set<string>;
}) {
  const initiatedAssetActions = new Map<string, number>();
  for (const activity of input.activities) {
    if (!activity.initiatedByWallet || activity.suspectedSpam || !activity.primaryAsset) continue;
    const key = activity.primaryAsset.address.toLowerCase();
    initiatedAssetActions.set(key, (initiatedAssetActions.get(key) ?? 0) + 1);
  }

  const groups = new Map<string, InternalAssetGroup>();
  for (const transfer of input.transfers) {
    if (isSpamTransfer(transfer)) continue;
    const key = transfer.token.address.toLowerCase();
    const current = groups.get(key) ?? {
      sample: transfer,
      receivedAmount: 0,
      sentAmount: 0,
      transferCount30d: 0,
      transferCount7d: 0,
      initiatedActivityCount: initiatedAssetActions.get(key) ?? 0,
      lastSeenAt: transfer.occurredAt,
      receivedUsd: 0,
      sentUsd: 0,
      pricedTransfers: 0,
      eligibleTransfers: 0,
    };
    const amount = Math.max(0, safeNumber(transfer.amount));
    if (transfer.direction === "in") current.receivedAmount += amount;
    else current.sentAmount += amount;
    current.transferCount30d += 1;
    if (isAfter(transfer.occurredAt, input.threshold7d)) current.transferCount7d += 1;
    if (Date.parse(transfer.occurredAt) > Date.parse(current.lastSeenAt)) {
      current.lastSeenAt = transfer.occurredAt;
      current.sample = transfer;
    }
    if (transfer.token.type === "ERC-20") current.eligibleTransfers += 1;
    const usd = knownUsd(transfer);
    if (usd !== null) {
      current.pricedTransfers += 1;
      if (transfer.direction === "in") current.receivedUsd += usd;
      else current.sentUsd += usd;
    }
    groups.set(key, current);
  }

  return [...groups.values()]
    .map<WalletAssetFlow>((group) => ({
      address: group.sample.token.address,
      name: group.sample.token.name,
      symbol: group.sample.token.symbol,
      type: group.sample.token.type,
      sector: sectorForTransfer(group.sample),
      receivedAmount: round(group.receivedAmount, 8),
      sentAmount: round(group.sentAmount, 8),
      netAmount: round(group.receivedAmount - group.sentAmount, 8),
      transferCount30d: group.transferCount30d,
      transferCount7d: group.transferCount7d,
      initiatedActivityCount: group.initiatedActivityCount,
      lastSeenAt: group.lastSeenAt,
      estimatedReceivedUsd: group.pricedTransfers ? round(group.receivedUsd, 2) : null,
      estimatedSentUsd: group.pricedTransfers ? round(group.sentUsd, 2) : null,
      estimatedNetUsd: group.pricedTransfers
        ? round(group.receivedUsd - group.sentUsd, 2)
        : null,
      pricingCoverage: group.pricedTransfers ? "priced" : "unpriced",
      passiveDistribution: input.passiveDistributionAssets.has(
        group.sample.token.address.toLowerCase(),
      ),
    }))
    .sort(
      (a, b) =>
        Number(a.address.toLowerCase() === QUID_ADDRESS) -
          Number(b.address.toLowerCase() === QUID_ADDRESS) ||
        Number(a.passiveDistribution) - Number(b.passiveDistribution) ||
        b.initiatedActivityCount - a.initiatedActivityCount ||
        b.transferCount7d - a.transferCount7d ||
        b.transferCount30d - a.transferCount30d ||
        Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt),
    );
}

function isProtocolTransaction(
  transaction: NormalizedTransaction,
  tokenAddresses: Set<string>,
) {
  if (
    transaction.source !== "normal" ||
    transaction.direction !== "out" ||
    transaction.status !== "ok" ||
    !transaction.to
  ) {
    return false;
  }
  const method = transaction.method?.trim() ?? "";
  if (SIMPLE_METHOD.test(method) && tokenAddresses.has(transaction.to.toLowerCase())) return false;
  if (SIMPLE_METHOD.test(method) && GENERIC_CONTRACT_NAME.test(transaction.toName?.trim() ?? "")) {
    return false;
  }
  return transaction.toIsContract !== false;
}

function buildProtocols(input: {
  transactions: NormalizedTransaction[];
  tokenAddresses: Set<string>;
  threshold7d: number;
}) {
  const groups = new Map<
    string,
    {
      sample: NormalizedTransaction;
      count30d: number;
      count7d: number;
      methods: Set<string>;
      timestamps: string[];
    }
  >();
  for (const transaction of input.transactions) {
    if (!isProtocolTransaction(transaction, input.tokenAddresses) || !transaction.to) continue;
    const key = transaction.to.toLowerCase();
    const current = groups.get(key) ?? {
      sample: transaction,
      count30d: 0,
      count7d: 0,
      methods: new Set<string>(),
      timestamps: [],
    };
    current.count30d += 1;
    if (isAfter(transaction.occurredAt, input.threshold7d)) current.count7d += 1;
    if (transaction.method) current.methods.add(transaction.method);
    current.timestamps.push(transaction.occurredAt);
    if (Date.parse(transaction.occurredAt) > Date.parse(current.sample.occurredAt)) {
      current.sample = transaction;
    }
    groups.set(key, current);
  }
  return [...groups.values()]
    .map<WalletProtocolInterest>((group) => {
      const name = group.sample.toName?.trim();
      const usefulName = name && !GENERIC_CONTRACT_NAME.test(name) ? name : shortAddress(group.sample.to!);
      const firstSeenAt = oldestTimestamp([...group.timestamps]);
      return {
        address: group.sample.to!,
        name: usefulName,
        sector: sectorFor(`${usefulName} ${[...group.methods].join(" ")}`),
        interactionCount30d: group.count30d,
        interactionCount7d: group.count7d,
        uniqueMethods: [...group.methods].sort().slice(0, 6),
        firstSeenAt,
        lastSeenAt: newestTimestamp([...group.timestamps]),
        isNew7d: isAfter(firstSeenAt, input.threshold7d),
      };
    })
    .sort(
      (a, b) =>
        b.interactionCount7d - a.interactionCount7d ||
        b.interactionCount30d - a.interactionCount30d ||
        Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt),
    );
}

function buildCounterparties(input: {
  address: string;
  transfers: NormalizedTransfer[];
  transactions: NormalizedTransaction[];
  trackedWallets: Set<string>;
  hotWallets: Set<string>;
  threshold7d: number;
  passiveDistributionAssets: Set<string>;
}) {
  const names = new Map<string, string>();
  const contractAddresses = new Set<string>();
  for (const transaction of input.transactions) {
    if (!transaction.to) continue;
    const address = transaction.to.toLowerCase();
    if (transaction.toName) names.set(address, transaction.toName);
    if (transaction.toIsContract) contractAddresses.add(address);
  }
  const groups = new Map<string, InternalCounterparty>();
  const touch = (address: string, occurredAt: string) => {
    const key = address.toLowerCase();
    if (key === input.address || key === ZERO_ADDRESS) return null;
    const current = groups.get(key) ?? {
      address: key,
      labels: new Set<string>(),
      inboundCount: 0,
      outboundCount: 0,
      assets: new Set<string>(),
      interactions: new Set<string>(),
      interactions7d: new Set<string>(),
      lastSeenAt: occurredAt,
      estimatedUsd: 0,
      pricedCount: 0,
      isContract: contractAddresses.has(key),
    };
    const knownName = names.get(key);
    if (knownName) current.labels.add(knownName);
    if (Date.parse(occurredAt) > Date.parse(current.lastSeenAt)) current.lastSeenAt = occurredAt;
    groups.set(key, current);
    return current;
  };
  for (const transfer of input.transfers) {
    if (
      isSpamTransfer(transfer) ||
      input.passiveDistributionAssets.has(transfer.token.address.toLowerCase())
    ) {
      continue;
    }
    const other = transfer.direction === "in" ? transfer.from : transfer.to;
    const current = touch(other, transfer.occurredAt);
    if (!current) continue;
    if (transfer.direction === "in") current.inboundCount += 1;
    else current.outboundCount += 1;
    current.assets.add(transfer.token.address.toLowerCase());
    current.interactions.add(`transfer:${transfer.transactionHash}`);
    if (isAfter(transfer.occurredAt, input.threshold7d)) {
      current.interactions7d.add(`transfer:${transfer.transactionHash}`);
    }
    const usd = knownUsd(transfer);
    if (usd !== null) {
      current.estimatedUsd += usd;
      current.pricedCount += 1;
    }
  }
  for (const transaction of input.transactions) {
    if (
      transaction.source !== "normal" ||
      transaction.status !== "ok" ||
      transaction.direction !== "out" ||
      !transaction.to
    ) {
      continue;
    }
    const current = touch(transaction.to, transaction.occurredAt);
    if (!current) continue;
    current.interactions.add(`tx:${transaction.transactionHash}`);
    if (isAfter(transaction.occurredAt, input.threshold7d)) {
      current.interactions7d.add(`tx:${transaction.transactionHash}`);
    }
    current.isContract ||= Boolean(transaction.toIsContract);
  }

  return [...groups.values()]
    .map<WalletCounterparty>((group) => {
      const relationship = input.hotWallets.has(group.address)
        ? "exchange"
        : input.trackedWallets.has(group.address)
          ? "cohort"
          : group.isContract
            ? "contract"
            : "external";
      const label = relationship === "exchange"
        ? "거래소 핫월렛"
        : relationship === "cohort"
          ? `추적 코호트 ${shortAddress(group.address)}`
          : [...group.labels][0] ?? shortAddress(group.address);
      return {
        address: group.address,
        label,
        relationship,
        inboundCount: group.inboundCount,
        outboundCount: group.outboundCount,
        assetCount: group.assets.size,
        interactionCount30d: group.interactions.size,
        interactionCount7d: group.interactions7d.size,
        lastSeenAt: group.lastSeenAt,
        estimatedUsd: group.pricedCount ? round(group.estimatedUsd, 2) : null,
      };
    })
    .sort(
      (a, b) =>
        Number(b.relationship === "exchange") - Number(a.relationship === "exchange") ||
        b.interactionCount7d - a.interactionCount7d ||
        b.interactionCount30d - a.interactionCount30d ||
        Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt),
    );
}

function buildInterests(input: {
  assetFlows: WalletAssetFlow[];
  protocols: WalletProtocolInterest[];
  activities: ActivityEvent[];
  threshold7d: number;
}) {
  const rows: Array<Omit<WalletInterestTopic, "share"> & { rawScore: number }> = [];
  const sectorGroups = new Map<
    string,
    { count30d: number; count7d: number; initiated: number; lastSeenAt: string; rawScore: number }
  >();
  const addSector = (
    sector: string,
    count30d: number,
    count7d: number,
    initiated: number,
    lastSeenAt: string,
    score: number,
  ) => {
    if (sector === "미분류") return;
    const current = sectorGroups.get(sector) ?? {
      count30d: 0,
      count7d: 0,
      initiated: 0,
      lastSeenAt,
      rawScore: 0,
    };
    current.count30d += count30d;
    current.count7d += count7d;
    current.initiated += initiated;
    current.rawScore += score;
    if (Date.parse(lastSeenAt) > Date.parse(current.lastSeenAt)) current.lastSeenAt = lastSeenAt;
    sectorGroups.set(sector, current);
  };

  for (const asset of input.assetFlows) {
    if (
      asset.address.toLowerCase() === QUID_ADDRESS ||
      PAYMENT_SYMBOLS.has(asset.symbol.toUpperCase()) ||
      asset.passiveDistribution
    ) {
      continue;
    }
    const rawScore =
      asset.initiatedActivityCount * 10 +
      asset.transferCount7d * 3 +
      asset.transferCount30d +
      (isAfter(asset.lastSeenAt, input.threshold7d) ? 4 : 0);
    addSector(
      asset.sector,
      asset.transferCount30d,
      asset.transferCount7d,
      asset.initiatedActivityCount,
      asset.lastSeenAt,
      rawScore,
    );
    rows.push({
      key: `asset:${asset.address.toLowerCase()}`,
      label: asset.symbol || asset.name,
      kind: asset.type === "ERC-20" ? "asset" : "nft",
      score: clamp(Math.round(rawScore)),
      rawScore,
      activityCount30d: asset.transferCount30d,
      activityCount7d: asset.transferCount7d,
      initiatedCount30d: asset.initiatedActivityCount,
      lastSeenAt: asset.lastSeenAt,
      address: asset.address,
    });
  }
  for (const protocol of input.protocols) {
    const rawScore =
      protocol.interactionCount7d * 8 +
      protocol.interactionCount30d * 3 +
      protocol.uniqueMethods.length * 4 +
      (protocol.isNew7d ? 8 : 0);
    addSector(
      protocol.sector,
      protocol.interactionCount30d,
      protocol.interactionCount7d,
      protocol.interactionCount30d,
      protocol.lastSeenAt,
      rawScore,
    );
    rows.push({
      key: `protocol:${protocol.address.toLowerCase()}`,
      label: protocol.name,
      kind: "protocol",
      score: clamp(Math.round(rawScore)),
      rawScore,
      activityCount30d: protocol.interactionCount30d,
      activityCount7d: protocol.interactionCount7d,
      initiatedCount30d: protocol.interactionCount30d,
      lastSeenAt: protocol.lastSeenAt,
      address: protocol.address,
    });
  }
  for (const [sector, value] of sectorGroups) {
    rows.push({
      key: `sector:${sector}`,
      label: sector,
      kind: "sector",
      score: clamp(Math.round(value.rawScore)),
      rawScore: value.rawScore * 1.15,
      activityCount30d: value.count30d,
      activityCount7d: value.count7d,
      initiatedCount30d: value.initiated,
      lastSeenAt: value.lastSeenAt,
      address: null,
    });
  }

  const total = rows.reduce((sum, row) => sum + row.rawScore, 0);
  return rows
    .map<WalletInterestTopic>(({ rawScore, ...row }) => ({
      ...row,
      share: total > 0 ? round(rawScore / total, 3) : 0,
    }))
    .sort(
      (a, b) =>
        Number(b.kind === "sector") - Number(a.kind === "sector") ||
        b.score - a.score ||
        Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt),
    )
    .slice(0, 12);
}

function choosePersona(input: {
  activities: ActivityEvent[];
  protocols: WalletProtocolInterest[];
  assetFlows: WalletAssetFlow[];
  initiatedShare: number;
  exchangeNonQuidOut: number;
}) {
  const count = (categories: ActivityCategory[]) =>
    input.activities.filter(
      (activity) => categories.includes(activity.category) && !activity.suspectedSpam,
    ).length;
  const trades = count([
    "token_buy_candidate",
    "token_sell_candidate",
    "nft_purchase_candidate",
    "nft_sale_candidate",
  ]);
  const defi = count(["bridge", "staking", "liquidity"]);
  const nft = count([
    "nft_purchase_candidate",
    "nft_sale_candidate",
    "nft_mint",
    "nft_send",
    "nft_receive",
  ]);
  const airdrops = count(["airdrop_received"]);
  const tokenReceives = count(["token_receive", "nft_receive"]);
  const tokenSends = count(["token_send", "nft_send"]);
  const nonBaseFlows = input.assetFlows.filter(
    (item) =>
      item.address.toLowerCase() !== QUID_ADDRESS &&
      !PAYMENT_SYMBOLS.has(item.symbol.toUpperCase()) &&
      !item.passiveDistribution,
  );
  const positive = nonBaseFlows.filter((item) => item.netAmount > 0).length;
  const negative = nonBaseFlows.filter((item) => item.netAmount < 0).length;
  let persona: WalletPersona;
  if (input.exchangeNonQuidOut >= 2) persona = "exchange_feeder";
  else if (trades >= 3) persona = "active_trader";
  else if (defi >= 2) persona = "defi_operator";
  else if (nft >= 3) persona = "nft_collector";
  else if (input.protocols.length >= 3) persona = "protocol_explorer";
  else if (airdrops >= 3 && input.initiatedShare >= 0.2) persona = "airdrop_hunter";
  else if (tokenReceives >= 3 && tokenSends >= 3 && input.initiatedShare >= 0.2) {
    persona = "token_operator";
  }
  else if (input.activities.length === 0 || input.initiatedShare < 0.15) persona = "passive_holder";
  else if (negative >= Math.max(2, positive * 1.5)) persona = "distributor";
  else if (positive >= Math.max(2, negative * 1.5)) persona = "accumulator";
  else persona = "multi_strategy";

  const tags = new Set<string>();
  if (trades > 0) tags.add("매매 흔적");
  if (defi > 0) tags.add("DeFi");
  if (nft > 0) tags.add("NFT");
  if (airdrops > 0) tags.add("에어드롭");
  if (input.protocols.some((protocol) => protocol.isNew7d)) tags.add("신규 컨트랙트");
  if (input.exchangeNonQuidOut > 0) tags.add("거래소 유출");
  if (input.initiatedShare < 0.2) tags.add("수동 유입 비중 높음");
  return { persona, tags: [...tags].slice(0, 5) };
}

function chooseMomentum(recent: number, prior: number): { momentum: WalletMomentum; ratio: number | null } {
  const recentDaily = recent / 7;
  const priorDaily = prior / 23;
  if (recent === 0) return { momentum: prior > 0 ? "cooling" : "inactive", ratio: prior > 0 ? 0 : null };
  if (priorDaily === 0) return { momentum: recent >= 3 ? "surging" : "rising", ratio: null };
  const ratio = recentDaily / priorDaily;
  if (ratio >= 2 && recent >= 3) return { momentum: "surging", ratio: round(ratio, 2) };
  if (ratio >= 1.25) return { momentum: "rising", ratio: round(ratio, 2) };
  if (ratio <= 0.55) return { momentum: "cooling", ratio: round(ratio, 2) };
  return { momentum: "stable", ratio: round(ratio, 2) };
}

function chooseStance(input: {
  recentActivities: ActivityEvent[];
  recentTransfers: NormalizedTransfer[];
  protocols: WalletProtocolInterest[];
  initiatedShare: number;
}): WalletStance {
  if (input.recentActivities.length === 0 && input.recentTransfers.length === 0) return "inactive";
  const newProtocols = input.protocols.filter((protocol) => protocol.isNew7d).length;
  if (newProtocols >= 2) return "exploring";
  const tradeIn = input.recentActivities.filter((activity) =>
    ["token_buy_candidate", "nft_purchase_candidate", "nft_mint"].includes(activity.category),
  ).length;
  const tradeOut = input.recentActivities.filter((activity) =>
    ["token_sell_candidate", "nft_sale_candidate"].includes(activity.category),
  ).length;
  if (tradeIn > 0 && tradeOut > 0) return "rotating";
  const relevant = input.recentTransfers.filter(
    (transfer) =>
      !isSpamTransfer(transfer) &&
      transfer.token.address.toLowerCase() !== QUID_ADDRESS &&
      !isPaymentTransfer(transfer),
  );
  const inbound = relevant.filter((transfer) => transfer.direction === "in").length;
  const outbound = relevant.filter((transfer) => transfer.direction === "out").length;
  if (outbound >= 2 && outbound > inbound * 1.35) return "distributing";
  if (inbound >= 2 && inbound > outbound * 1.35 && input.initiatedShare >= 0.2) {
    return "accumulating";
  }
  return "monitoring";
}

function buildNotableMoves(input: {
  activities: ActivityEvent[];
  transfers: NormalizedTransfer[];
  transactions: NormalizedTransaction[];
  signals: IntelligenceSignal[];
  threshold7d: number;
}) {
  const transactionUsd = new Map<string, number>();
  const pricedTransaction = new Set<string>();
  for (const transfer of input.transfers) {
    const usd = knownUsd(transfer);
    if (usd === null) continue;
    transactionUsd.set(transfer.transactionHash, (transactionUsd.get(transfer.transactionHash) ?? 0) + usd);
    pricedTransaction.add(transfer.transactionHash);
  }
  const transactionByHash = new Map(
    input.transactions
      .filter((transaction) => transaction.source === "normal")
      .map((transaction) => [transaction.transactionHash, transaction]),
  );
  const signalScore = new Map<string, number>();
  for (const signal of input.signals) {
    for (const hash of signal.transactionHashes) {
      signalScore.set(hash, Math.max(signalScore.get(hash) ?? 0, signal.score));
    }
  }
  const categoryWeight: Partial<Record<ActivityCategory, number>> = {
    token_buy_candidate: 30,
    token_sell_candidate: 28,
    nft_purchase_candidate: 30,
    nft_sale_candidate: 28,
    nft_mint: 28,
    bridge: 24,
    staking: 22,
    liquidity: 24,
    contract_interaction: 18,
    approval: 12,
    token_send: 10,
    nft_send: 14,
    token_receive: 4,
    nft_receive: 8,
    airdrop_received: 5,
  };
  const bestByTransaction = new Map<string, { activity: ActivityEvent; score: number }>();
  for (const activity of input.activities) {
    if (activity.suspectedSpam) continue;
    const usd = transactionUsd.get(activity.transactionHash) ?? 0;
    const score = clamp(
      (categoryWeight[activity.category] ?? 5) +
        (activity.initiatedByWallet ? 20 : 0) +
        (isAfter(activity.occurredAt, input.threshold7d) ? 15 : 0) +
        Math.min(15, (signalScore.get(activity.transactionHash) ?? 0) * 0.15) +
        Math.min(12, Math.log10(usd + 1) * 2),
    );
    const current = bestByTransaction.get(activity.transactionHash);
    if (!current || score > current.score) bestByTransaction.set(activity.transactionHash, { activity, score });
  }
  return [...bestByTransaction.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.activity.occurredAt) - Date.parse(a.activity.occurredAt),
    )
    .slice(0, 8)
    .map<WalletNotableMove>(({ activity, score }) => {
      const transaction = transactionByHash.get(activity.transactionHash);
      const usd = transactionUsd.get(activity.transactionHash);
      return {
        id: activity.id,
        occurredAt: activity.occurredAt,
        category: activity.category,
        title: activity.title,
        description: activity.description,
        whyItMatters: MOVE_REASON[activity.category],
        importanceScore: Math.round(score),
        confidence: activity.confidence,
        asset: activity.primaryAsset,
        counterparty: transaction?.to ?? null,
        method: activity.method ?? transaction?.method ?? null,
        estimatedUsd: pricedTransaction.has(activity.transactionHash) ? round(usd ?? 0, 2) : null,
        basescanUrl: activity.basescanUrl,
      };
    });
}

function primarySectorFromInterests(interests: WalletInterestTopic[]) {
  return interests.find((interest) => interest.kind === "sector")?.label ?? "미분류";
}

function buildWatchpoints(input: {
  profile: Pick<
    WalletResearchProfile,
    "momentum" | "stance" | "primarySector" | "evidenceConfidence" | "researchPriority"
  >;
  assetFlows: WalletAssetFlow[];
  protocols: WalletProtocolInterest[];
  signals: IntelligenceSignal[];
}) {
  const points: string[] = [];
  const activeAsset = input.assetFlows.find(
    (asset) =>
      asset.address.toLowerCase() !== QUID_ADDRESS &&
      !asset.passiveDistribution &&
      asset.transferCount7d > 0,
  );
  if (activeAsset) {
    const direction = activeAsset.netAmount > 0 ? "순유입" : activeAsset.netAmount < 0 ? "순유출" : "회전";
    points.push(`${activeAsset.symbol} ${direction}이 다음 수집에서도 이어지는지 확인`);
  }
  const newProtocol = input.protocols.find((protocol) => protocol.isNew7d);
  if (newProtocol) points.push(`${newProtocol.name} 신규 호출 이후 토큰·NFT 취득 여부 추적`);
  const topSignal = [...input.signals].sort((a, b) => b.score - a.score)[0];
  if (topSignal) points.push(`${topSignal.score}점 ${topSignal.title}의 후속 유입·유출 확인`);
  if (input.profile.momentum === "surging") points.push("급증이 일회성 배포인지 반복적인 직접 행동인지 재확인");
  if (input.profile.stance === "distributing") points.push("유출 목적지가 거래소·코호트·신규 외부 주소 중 어디로 수렴하는지 확인");
  if (input.profile.evidenceConfidence === "low") points.push("직접 서명 근거가 적어 단순 수신을 투자 관심으로 해석하지 않기");
  if (points.length === 0) points.push("새 직접 서명 트랜잭션과 관심 자산 변화가 나타날 때 재평가");
  return [...new Set(points)].slice(0, 4);
}

function buildProfile(input: {
  wallet: WalletSeed;
  activities: ActivityEvent[];
  transfers: NormalizedTransfer[];
  transactions: NormalizedTransaction[];
  signals: IntelligenceSignal[];
  generatedAt: string;
  trackedWallets: Set<string>;
  hotWallets: Set<string>;
  passiveDistributionAssets: Set<string>;
}): WalletResearchProfile {
  const generatedTime = Date.parse(input.generatedAt);
  const threshold7d = generatedTime - 7 * DAY_MS;
  const threshold30d = generatedTime - 30 * DAY_MS;
  const walletActivities = input.activities.filter(
    (activity) =>
      activity.walletAddress === input.wallet.address.toLowerCase() &&
      isAfter(activity.occurredAt, threshold30d),
  );
  const walletTransfers = input.transfers.filter(
    (transfer) =>
      transfer.walletAddress === input.wallet.address.toLowerCase() &&
      isAfter(transfer.occurredAt, threshold30d),
  );
  const walletTransactions = input.transactions.filter(
    (transaction) =>
      transaction.walletAddress === input.wallet.address.toLowerCase() &&
      isAfter(transaction.occurredAt, threshold30d),
  );
  const isQuidActivity = (activity: ActivityEvent) =>
    activity.primaryAsset?.address.toLowerCase() === QUID_ADDRESS;
  const isPassiveDistributionActivity = (activity: ActivityEvent) =>
    Boolean(
      activity.primaryAsset &&
      input.passiveDistributionAssets.has(activity.primaryAsset.address.toLowerCase()),
    );
  const researchActivities = walletActivities.filter(
    (activity) =>
      !activity.suspectedSpam &&
      !isQuidActivity(activity) &&
      !isPassiveDistributionActivity(activity),
  );
  const researchTransfers = walletTransfers.filter(
    (transfer) =>
      !isSpamTransfer(transfer) &&
      transfer.token.address.toLowerCase() !== QUID_ADDRESS &&
      !input.passiveDistributionAssets.has(transfer.token.address.toLowerCase()),
  );
  const spamAssetAddresses = new Set(
    walletTransfers
      .filter(isSpamTransfer)
      .map((transfer) => transfer.token.address.toLowerCase()),
  );
  const meaningful = researchActivities.filter(
    (activity) => activityIsMeaningful(activity),
  );
  const meaningful7d = meaningful.filter((activity) => isAfter(activity.occurredAt, threshold7d));
  const meaningfulPrior = meaningful.filter((activity) => !isAfter(activity.occurredAt, threshold7d));
  const recentTransfers = researchTransfers.filter((transfer) =>
    isAfter(transfer.occurredAt, threshold7d),
  );
  const directTransactions = walletTransactions.filter(
    (transaction) =>
      transaction.source === "normal" &&
      transaction.direction === "out" &&
      transaction.status === "ok" &&
      transaction.to?.toLowerCase() !== QUID_ADDRESS &&
      !input.passiveDistributionAssets.has(transaction.to?.toLowerCase() ?? "") &&
      !spamAssetAddresses.has(transaction.to?.toLowerCase() ?? ""),
  );
  const initiatedActivities = researchActivities.filter(
    (activity) => activity.initiatedByWallet,
  );
  const initiatedShare = researchActivities.length
    ? initiatedActivities.length / researchActivities.length
    : 0;
  const tokenAddresses = new Set(walletTransfers.map((transfer) => transfer.token.address.toLowerCase()));
  const assetFlows = buildAssetFlows({
    transfers: walletTransfers,
    activities: walletActivities,
    threshold7d,
    passiveDistributionAssets: input.passiveDistributionAssets,
  });
  const protocols = buildProtocols({
    transactions: walletTransactions,
    tokenAddresses,
    threshold7d,
  });
  const counterparties = buildCounterparties({
    address: input.wallet.address.toLowerCase(),
    transfers: walletTransfers,
    transactions: walletTransactions,
    trackedWallets: input.trackedWallets,
    hotWallets: input.hotWallets,
    threshold7d,
    passiveDistributionAssets: input.passiveDistributionAssets,
  });
  const interests = buildInterests({
    assetFlows,
    protocols,
    activities: walletActivities,
    threshold7d,
  });
  const primarySector = primarySectorFromInterests(interests);
  const { momentum, ratio: momentumRatio } = chooseMomentum(
    meaningful7d.length,
    meaningfulPrior.length,
  );
  const stance = chooseStance({
    recentActivities: meaningful7d,
    recentTransfers,
    protocols,
    initiatedShare,
  });
  const { persona, tags } = choosePersona({
    activities: researchActivities,
    protocols,
    assetFlows,
    initiatedShare,
    exchangeNonQuidOut: walletTransfers.filter(
      (transfer) =>
        transfer.direction === "out" &&
        transfer.token.address.toLowerCase() !== QUID_ADDRESS &&
        input.hotWallets.has(transfer.to.toLowerCase()),
    ).length,
  });
  const uniqueMethods = new Set(directTransactions.map((transaction) => transaction.method).filter(Boolean));
  const advancedActions = meaningful.filter((activity) =>
    [
      "token_buy_candidate",
      "token_sell_candidate",
      "nft_purchase_candidate",
      "nft_sale_candidate",
      "nft_mint",
      "bridge",
      "staking",
      "liquidity",
    ].includes(activity.category),
  ).length;
  const spamShare = walletActivities.length
    ? walletActivities.filter(
        (activity) => activity.suspectedSpam || isPassiveDistributionActivity(activity),
      ).length / walletActivities.length
    : 0;
  const agencyScore = Math.round(clamp(
    initiatedShare * 35 +
      Math.min(30, directTransactions.length * 3) +
      Math.min(20, meaningful.length * 1.5) +
      Math.min(15, uniqueMethods.size * 3) -
      spamShare * 20,
  ));
  const initiatedActivitiesByTransaction = new Map<string, number>();
  for (const activity of initiatedActivities) {
    initiatedActivitiesByTransaction.set(
      activity.transactionHash,
      (initiatedActivitiesByTransaction.get(activity.transactionHash) ?? 0) + 1,
    );
  }
  const multiStepTransactions = [...initiatedActivitiesByTransaction.values()].filter(
    (count) => count >= 2,
  ).length;
  const sophisticationScore = Math.round(clamp(
    Math.min(32, protocols.length * 8) +
      Math.min(28, advancedActions * 5) +
      Math.min(20, assetFlows.filter((asset) => asset.initiatedActivityCount > 0).length * 4) +
      Math.min(20, multiStepTransactions * 2),
  ));
  const researchSignals = input.signals.filter((signal) => signal.signalClass !== "noise");
  const topSignalScore = Math.max(0, ...researchSignals.map((signal) => signal.score));
  const recentSignalCount = researchSignals.filter((signal) =>
    isAfter(signal.occurredAt, threshold7d),
  ).length;
  const momentumBonus = momentum === "surging" ? 15 : momentum === "rising" ? 9 : momentum === "cooling" ? -4 : 2;
  const researchPriority = Math.round(clamp(
    topSignalScore * 0.38 +
      Math.min(16, recentSignalCount * 3) +
      agencyScore * 0.2 +
      sophisticationScore * 0.1 +
      momentumBonus +
      (input.wallet.inTop100 ? 5 : 0) -
      (persona === "passive_holder" ? 10 : 0),
  ));
  const evidenceCount = new Set([
    ...meaningful.map((activity) => activity.transactionHash),
    ...directTransactions.map((transaction) => transaction.transactionHash),
  ]).size;
  const evidenceConfidence = confidenceForProfile(evidenceCount, directTransactions.length);
  const activeDays30d = new Set(meaningful.map((activity) => KST_DATE_FORMATTER.format(new Date(activity.occurredAt)))).size;
  const activeDays7d = new Set(meaningful7d.map((activity) => KST_DATE_FORMATTER.format(new Date(activity.occurredAt)))).size;
  const eligibleTransfers = walletTransfers.filter(
    (transfer) =>
      transfer.token.type === "ERC-20" &&
      !isSpamTransfer(transfer) &&
      transfer.token.address.toLowerCase() !== QUID_ADDRESS &&
      !input.passiveDistributionAssets.has(transfer.token.address.toLowerCase()),
  );
  const pricedTransfers = eligibleTransfers.filter((transfer) => knownUsd(transfer) !== null);
  const knownFlowUsd30d = pricedTransfers.length
    ? round(pricedTransfers.reduce((sum, transfer) => sum + (knownUsd(transfer) ?? 0), 0), 2)
    : null;
  const pricingCoverage = eligibleTransfers.length
    ? round(pricedTransfers.length / eligibleTransfers.length, 3)
    : 0;
  const latestActivityAt = newestTimestamp([
    ...researchActivities.map((activity) => activity.occurredAt),
    ...directTransactions.map((transaction) => transaction.occurredAt),
    ...researchTransfers.map((transfer) => transfer.occurredAt),
  ]) || null;
  const ratioText = momentumRatio === null
    ? meaningful7d.length > 0
      ? "비교 구간에 없던 활동이 새로 발생"
      : "비교 가능한 활동 없음"
    : `이전 23일 일평균 대비 ${momentumRatio.toFixed(1)}배`;
  const primaryInterest = primarySector === "미분류"
    ? interests.find((interest) => interest.kind !== "sector")?.label ?? "뚜렷한 관심 자산 없음"
    : primarySector;
  const headline = `${primaryInterest} 중심 ${PERSONA_META[persona].label} · ${MOMENTUM_LABELS[momentum]}`;
  const analystView = `지난 30일 의미 행동 ${meaningful.length}건과 직접 서명 트랜잭션 ${directTransactions.length}건이 확인됐습니다. 비스팸 활동의 ${formatPercent(initiatedShare)}가 지갑 주도이며, ${primaryInterest} 관련 흔적이 가장 두드러집니다. 현재 판정은 ${STANCE_LABELS[stance]}이고 근거 신뢰도는 ${evidenceConfidence.toUpperCase()}입니다.`;
  const recentChange = `최근 7일 의미 행동은 ${meaningful7d.length}건으로 ${ratioText}입니다. 활동일은 ${activeDays7d}일이며 ${protocols.filter((protocol) => protocol.isNew7d).length}개 신규 컨트랙트가 포착됐습니다.`;
  const notableMoves = buildNotableMoves({
    activities: researchActivities,
    transfers: researchTransfers,
    transactions: directTransactions,
    signals: researchSignals,
    threshold7d,
  });
  const flags = new Set<string>(tags);
  if (input.wallet.inTop100) flags.add("QUID 입금 Top 100");
  if (agencyScore >= 65) flags.add("높은 주도성");
  if (researchPriority >= 70) flags.add("우선 조사");
  if (momentum === "surging") flags.add("활동 급증");
  if (pricingCoverage < 0.25) flags.add("가격 근거 제한");
  const passiveDistributionCount = assetFlows.filter(
    (asset) => asset.passiveDistribution,
  ).length;
  if (passiveDistributionCount > 0) {
    flags.add(`수동 배포 ${passiveDistributionCount}종 제외`);
  }

  const partialProfile = {
    momentum,
    stance,
    primarySector,
    evidenceConfidence,
    researchPriority,
  };
  return {
    address: input.wallet.address.toLowerCase(),
    persona,
    personaLabel: PERSONA_META[persona].label,
    secondaryTags: tags,
    headline,
    analystView,
    recentChange,
    momentum,
    momentumRatio,
    stance,
    researchPriority,
    agencyScore,
    sophisticationScore,
    evidenceConfidence,
    evidenceCount,
    activeDays30d,
    activeDays7d,
    meaningfulActions30d: meaningful.length,
    meaningfulActions7d: meaningful7d.length,
    initiatedTransactions30d: directTransactions.length,
    initiatedShare: round(initiatedShare, 3),
    uniqueAssets30d: new Set(
      assetFlows
        .filter(
          (asset) =>
            asset.address.toLowerCase() !== QUID_ADDRESS &&
            !asset.passiveDistribution,
        )
        .map((asset) => asset.address.toLowerCase()),
    ).size,
    uniqueProtocols30d: protocols.length,
    uniqueCounterparties30d: counterparties.length,
    knownFlowUsd30d,
    pricingCoverage,
    primarySector,
    behaviorMix: buildBehaviorMix({ activities: researchActivities, threshold7d }),
    interests,
    assetFlows: assetFlows.slice(0, 10),
    protocols: protocols.slice(0, 10),
    counterparties: counterparties.slice(0, 10),
    trend14d: buildTrend14d({
      activities: researchActivities,
      transfers: researchTransfers,
      generatedAt: input.generatedAt,
    }),
    notableMoves,
    watchpoints: buildWatchpoints({
      profile: partialProfile,
      assetFlows,
      protocols,
      signals: researchSignals,
    }),
    flags: [...flags],
    latestActivityAt,
  };
}

function buildClusters(profiles: WalletResearchProfile[], wallets: WalletSeed[]) {
  const walletByAddress = new Map(wallets.map((wallet) => [wallet.address.toLowerCase(), wallet]));
  const groups = new Map<WalletPersona, WalletResearchProfile[]>();
  for (const profile of profiles) {
    const current = groups.get(profile.persona) ?? [];
    current.push(profile);
    groups.set(profile.persona, current);
  }
  return [...groups.entries()]
    .map<WalletStrategyCluster>(([persona, members]) => {
      const sectorCounts = new Map<string, number>();
      const assetCounts = new Map<string, number>();
      for (const profile of members) {
        if (profile.primarySector !== "미분류") {
          sectorCounts.set(profile.primarySector, (sectorCounts.get(profile.primarySector) ?? 0) + 1);
        }
        for (const asset of profile.assetFlows.slice(0, 3)) {
          if (asset.address.toLowerCase() === QUID_ADDRESS || asset.passiveDistribution) continue;
          assetCounts.set(asset.symbol, (assetCounts.get(asset.symbol) ?? 0) + 1);
        }
      }
      const ranked = (map: Map<string, number>) =>
        [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key]) => key);
      const sorted = [...members].sort((a, b) => b.researchPriority - a.researchPriority);
      return {
        id: persona,
        label: PERSONA_META[persona].label,
        description: PERSONA_META[persona].description,
        walletCount: members.length,
        walletShare: round(members.length / profiles.length, 3),
        upbitWallets: members.filter((profile) => walletByAddress.get(profile.address)?.exchange === "Upbit").length,
        bithumbWallets: members.filter((profile) => walletByAddress.get(profile.address)?.exchange === "Bithumb").length,
        activeWallets7d: members.filter((profile) => profile.meaningfulActions7d > 0).length,
        averagePriority: Math.round(members.reduce((sum, profile) => sum + profile.researchPriority, 0) / members.length),
        averageAgency: Math.round(members.reduce((sum, profile) => sum + profile.agencyScore, 0) / members.length),
        topSectors: ranked(sectorCounts).slice(0, 3),
        topAssets: ranked(assetCounts).slice(0, 4),
        representativeWallets: sorted.slice(0, 5).map((profile) => profile.address),
      };
    })
    .sort(
      (a, b) =>
        b.averagePriority - a.averagePriority ||
        b.activeWallets7d - a.activeWallets7d ||
        b.walletCount - a.walletCount,
    );
}

function buildAssetThemes(input: {
  transfers: NormalizedTransfer[];
  activities: ActivityEvent[];
  profiles: WalletResearchProfile[];
  wallets: WalletSeed[];
  generatedAt: string;
}) {
  const generatedTime = Date.parse(input.generatedAt);
  const threshold7d = generatedTime - 7 * DAY_MS;
  const threshold30d = generatedTime - 30 * DAY_MS;
  const walletByAddress = new Map(input.wallets.map((wallet) => [wallet.address.toLowerCase(), wallet]));
  const profileByAddress = new Map(input.profiles.map((profile) => [profile.address, profile]));
  const initiatedTransactions = new Set(
    input.activities
      .filter((activity) => activity.initiatedByWallet && !activity.suspectedSpam)
      .map((activity) => `${activity.walletAddress}:${activity.transactionHash}`),
  );
  const groups = new Map<string, AssetThemeGroup>();
  for (const transfer of input.transfers) {
    const occurred = Date.parse(transfer.occurredAt);
    if (
      occurred < threshold30d ||
      isSpamTransfer(transfer) ||
      transfer.token.address.toLowerCase() === QUID_ADDRESS ||
      isPaymentTransfer(transfer)
    ) {
      continue;
    }
    const key = transfer.token.address.toLowerCase();
    const current = groups.get(key) ?? {
      sample: transfer,
      wallets30d: new Set<string>(),
      wallets7d: new Set<string>(),
      initiatedWallets7d: new Set<string>(),
      top100Wallets7d: new Set<string>(),
      exchanges7d: new Set<string>(),
      walletActions7d: new Map<string, number>(),
      actionCount7d: 0,
      priorActionCount: 0,
      inboundCount7d: 0,
      outboundCount7d: 0,
      inboundSources7d: new Map<string, number>(),
      inboundAmounts7d: new Map<string, number>(),
      estimatedNetUsd7d: 0,
      pricedCount7d: 0,
      evidenceUrls: new Set<string>(),
      lastSeenAt: transfer.occurredAt,
    };
    const wallet = transfer.walletAddress.toLowerCase();
    current.wallets30d.add(wallet);
    if (occurred >= threshold7d) {
      current.wallets7d.add(wallet);
      current.actionCount7d += 1;
      current.walletActions7d.set(wallet, (current.walletActions7d.get(wallet) ?? 0) + 1);
      if (
        transfer.direction === "out" ||
        initiatedTransactions.has(`${wallet}:${transfer.transactionHash}`)
      ) {
        current.initiatedWallets7d.add(wallet);
      }
      const walletSeed = walletByAddress.get(wallet);
      if (walletSeed?.inTop100) current.top100Wallets7d.add(wallet);
      if (walletSeed) current.exchanges7d.add(walletSeed.exchange);
      if (transfer.direction === "in") {
        current.inboundCount7d += 1;
        current.inboundSources7d.set(
          transfer.from.toLowerCase(),
          (current.inboundSources7d.get(transfer.from.toLowerCase()) ?? 0) + 1,
        );
        const amountKey = String(round(safeNumber(transfer.amount), 8));
        current.inboundAmounts7d.set(amountKey, (current.inboundAmounts7d.get(amountKey) ?? 0) + 1);
      } else {
        current.outboundCount7d += 1;
      }
      const usd = knownUsd(transfer);
      if (usd !== null) {
        current.pricedCount7d += 1;
        current.estimatedNetUsd7d += transfer.direction === "in" ? usd : -usd;
      }
      if (current.evidenceUrls.size < 8) {
        current.evidenceUrls.add(`https://basescan.org/tx/${transfer.transactionHash}`);
      }
    } else {
      current.priorActionCount += 1;
    }
    if (occurred > Date.parse(current.lastSeenAt)) {
      current.lastSeenAt = transfer.occurredAt;
      current.sample = transfer;
    }
    groups.set(key, current);
  }

  return [...groups.values()]
    .map<CohortTheme>((group) => {
      const recentDailyRate = group.actionCount7d / 7;
      const priorDailyBaseline = group.priorActionCount / 23;
      const acceleration = priorDailyBaseline > 0
        ? round(recentDailyRate / priorDailyBaseline, 2)
        : group.actionCount7d > 0
          ? null
          : 0;
      const maxSourceShare = group.inboundCount7d
        ? Math.max(0, ...group.inboundSources7d.values()) / group.inboundCount7d
        : 0;
      const maxAmountShare = group.inboundCount7d
        ? Math.max(0, ...group.inboundAmounts7d.values()) / group.inboundCount7d
        : 0;
      const passiveRatio = group.wallets7d.size
        ? 1 - group.initiatedWallets7d.size / group.wallets7d.size
        : 1;
      const passiveNoise =
        group.wallets7d.size >= 3 &&
        group.inboundCount7d >= 3 &&
        (maxSourceShare >= 0.75 || maxAmountShare >= 0.75) &&
        passiveRatio >= 0.7;
      const netDirection = group.inboundCount7d - group.outboundCount7d;
      let status: CohortTheme["status"];
      if (passiveNoise) status = "passive_noise";
      else if (group.priorActionCount === 0 && group.initiatedWallets7d.size > 0) status = "emerging";
      else if ((acceleration ?? 0) >= 1.75) status = "accelerating";
      else if (netDirection > 0) status = "accumulating";
      else if (netDirection < 0) status = "distributing";
      else status = "fading";
      const score = Math.round(clamp(
        Math.min(24, group.wallets7d.size * 4) +
          Math.min(28, group.initiatedWallets7d.size * 7) +
          Math.min(12, group.top100Wallets7d.size * 2) +
          (group.exchanges7d.size >= 2 ? 10 : 0) +
          Math.min(15, Math.max(0, ((acceleration ?? 1) - 1) * 8)) +
          (Math.abs(netDirection) >= 2 ? 6 : 0) -
          (passiveNoise ? 35 : passiveRatio > 0.8 ? 15 : 0),
      ));
      const sector = sectorForTransfer(group.sample);
      const topWallets = [...group.wallets7d]
        .sort(
          (a, b) =>
            (profileByAddress.get(b)?.researchPriority ?? 0) -
              (profileByAddress.get(a)?.researchPriority ?? 0) ||
            (group.walletActions7d.get(b) ?? 0) - (group.walletActions7d.get(a) ?? 0),
        )
        .slice(0, 6);
      const thesis = status === "passive_noise"
        ? `${group.sample.token.symbol} 유입은 ${group.wallets7d.size}개 지갑에 퍼졌지만 단일 발신자·동일 수량 집중도가 높아 알파보다 배포 이벤트 가능성이 큽니다.`
        : `${group.sample.token.symbol}에서 최근 7일 ${group.wallets7d.size}개 지갑, 그중 ${group.initiatedWallets7d.size}개 직접 행동이 확인됐습니다. ${group.exchanges7d.size}개 거래소 코호트 참여와 ${group.inboundCount7d}회 유입·${group.outboundCount7d}회 유출을 함께 봐야 합니다.`;
      const caveat = group.initiatedWallets7d.size === 0
        ? "지갑이 직접 시작한 행동이 없어 수동 수신을 투자 관심으로 확정할 수 없습니다."
        : "Transfer 로그는 매수 체결을 뜻하지 않으므로 결제자산 동반 여부와 후속 보유를 확인해야 합니다.";
      return {
        id: `asset:${group.sample.token.address.toLowerCase()}`,
        kind: "asset",
        label: group.sample.token.symbol || group.sample.token.name,
        sublabel: group.sample.token.name,
        address: group.sample.token.address,
        sector,
        status,
        score,
        confidence: confidenceFromEvidence(
          group.wallets7d.size,
          group.initiatedWallets7d.size,
          group.exchanges7d.size,
        ),
        walletCount7d: group.wallets7d.size,
        walletCount30d: group.wallets30d.size,
        initiatedWalletCount7d: group.initiatedWallets7d.size,
        top100WalletCount7d: group.top100Wallets7d.size,
        exchangeCount7d: group.exchanges7d.size,
        actionCount7d: group.actionCount7d,
        priorDailyBaseline: round(priorDailyBaseline, 2),
        recentDailyRate: round(recentDailyRate, 2),
        acceleration,
        inboundCount7d: group.inboundCount7d,
        outboundCount7d: group.outboundCount7d,
        estimatedNetUsd7d: group.pricedCount7d ? round(group.estimatedNetUsd7d, 2) : null,
        topWallets,
        thesis,
        caveat,
        evidenceUrls: [...group.evidenceUrls],
        lastSeenAt: group.lastSeenAt,
      };
    })
    .filter((theme) => theme.walletCount7d > 0)
    .sort(
      (a, b) =>
        Number(a.status === "passive_noise") - Number(b.status === "passive_noise") ||
        b.score - a.score ||
        b.initiatedWalletCount7d - a.initiatedWalletCount7d ||
        Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt),
    );
}

function buildProtocolThemes(input: {
  profiles: WalletResearchProfile[];
  wallets: WalletSeed[];
}) {
  const walletByAddress = new Map(input.wallets.map((wallet) => [wallet.address.toLowerCase(), wallet]));
  const groups = new Map<
    string,
    {
      sample: WalletProtocolInterest;
      wallets30d: Set<string>;
      wallets7d: Set<string>;
      top100: Set<string>;
      exchanges: Set<string>;
      actions7d: number;
      actions30d: number;
      topWallets: Array<{ address: string; priority: number }>;
    }
  >();
  for (const profile of input.profiles) {
    for (const protocol of profile.protocols) {
      const key = protocol.address.toLowerCase();
      const current = groups.get(key) ?? {
        sample: protocol,
        wallets30d: new Set<string>(),
        wallets7d: new Set<string>(),
        top100: new Set<string>(),
        exchanges: new Set<string>(),
        actions7d: 0,
        actions30d: 0,
        topWallets: [],
      };
      current.wallets30d.add(profile.address);
      current.actions30d += protocol.interactionCount30d;
      if (protocol.interactionCount7d > 0) {
        current.wallets7d.add(profile.address);
        current.actions7d += protocol.interactionCount7d;
        const wallet = walletByAddress.get(profile.address);
        if (wallet?.inTop100) current.top100.add(profile.address);
        if (wallet) current.exchanges.add(wallet.exchange);
        current.topWallets.push({ address: profile.address, priority: profile.researchPriority });
      }
      if (Date.parse(protocol.lastSeenAt) > Date.parse(current.sample.lastSeenAt)) current.sample = protocol;
      groups.set(key, current);
    }
  }
  return [...groups.values()]
    .filter((group) => group.wallets7d.size > 0)
    .map<CohortTheme>((group) => {
      const score = Math.round(clamp(
        Math.min(32, group.wallets7d.size * 8) +
          Math.min(20, group.actions7d * 3) +
          Math.min(12, group.top100.size * 3) +
          (group.exchanges.size >= 2 ? 12 : 0) +
          (group.sample.isNew7d ? 12 : 0),
      ));
      const priorActions = Math.max(0, group.actions30d - group.actions7d);
      const recentDailyRate = group.actions7d / 7;
      const priorDailyBaseline = priorActions / 23;
      const acceleration = priorDailyBaseline > 0 ? round(recentDailyRate / priorDailyBaseline, 2) : null;
      const status: CohortTheme["status"] = group.sample.isNew7d
        ? "emerging"
        : (acceleration ?? 0) >= 1.75
          ? "accelerating"
          : "accumulating";
      return {
        id: `protocol:${group.sample.address.toLowerCase()}`,
        kind: "protocol",
        label: group.sample.name,
        sublabel: `${group.sample.uniqueMethods.slice(0, 3).join(" · ") || "직접 컨트랙트 호출"}`,
        address: group.sample.address,
        sector: group.sample.sector,
        status,
        score,
        confidence: confidenceFromEvidence(group.wallets7d.size, group.wallets7d.size, group.exchanges.size),
        walletCount7d: group.wallets7d.size,
        walletCount30d: group.wallets30d.size,
        initiatedWalletCount7d: group.wallets7d.size,
        top100WalletCount7d: group.top100.size,
        exchangeCount7d: group.exchanges.size,
        actionCount7d: group.actions7d,
        priorDailyBaseline: round(priorDailyBaseline, 2),
        recentDailyRate: round(recentDailyRate, 2),
        acceleration,
        inboundCount7d: 0,
        outboundCount7d: 0,
        estimatedNetUsd7d: null,
        topWallets: group.topWallets.sort((a, b) => b.priority - a.priority).slice(0, 6).map((item) => item.address),
        thesis: `${group.wallets7d.size}개 지갑이 최근 7일 ${group.sample.name} 컨트랙트를 ${group.actions7d}회 직접 호출했습니다. 단순 토큰 수신보다 관심 근거가 강한 행동입니다.`,
        caveat: "컨트랙트 호출 목적은 메서드와 후속 자산 이동을 함께 검토해야 하며 수익 기대를 보장하지 않습니다.",
        evidenceUrls: [],
        lastSeenAt: group.sample.lastSeenAt,
      };
    })
    .sort((a, b) => b.score - a.score || b.walletCount7d - a.walletCount7d);
}

function buildSectorThemes(profiles: WalletResearchProfile[], wallets: WalletSeed[]) {
  const walletByAddress = new Map(wallets.map((wallet) => [wallet.address.toLowerCase(), wallet]));
  const sectors = new Map<string, WalletResearchProfile[]>();
  for (const profile of profiles) {
    if (profile.primarySector === "미분류" || profile.meaningfulActions7d === 0) continue;
    const current = sectors.get(profile.primarySector) ?? [];
    current.push(profile);
    sectors.set(profile.primarySector, current);
  }
  return [...sectors.entries()]
    .map<CohortTheme>(([sector, members]) => {
      const exchanges = new Set(members.map((profile) => walletByAddress.get(profile.address)?.exchange).filter(Boolean));
      const top100 = members.filter((profile) => walletByAddress.get(profile.address)?.inTop100);
      const surging = members.filter((profile) => ["surging", "rising"].includes(profile.momentum));
      const actions7d = members.reduce((sum, profile) => sum + profile.meaningfulActions7d, 0);
      const priorActions = members.reduce(
        (sum, profile) => sum + Math.max(0, profile.meaningfulActions30d - profile.meaningfulActions7d),
        0,
      );
      const recentDailyRate = actions7d / 7;
      const priorDailyBaseline = priorActions / 23;
      const acceleration = priorDailyBaseline > 0 ? round(recentDailyRate / priorDailyBaseline, 2) : null;
      const score = Math.round(clamp(
        Math.min(32, members.length * 6) +
          Math.min(24, surging.length * 6) +
          Math.min(14, top100.length * 2) +
          (exchanges.size >= 2 ? 12 : 0) +
          Math.min(12, Math.max(0, ((acceleration ?? 1) - 1) * 6)),
      ));
      const sorted = [...members].sort((a, b) => b.researchPriority - a.researchPriority);
      return {
        id: `sector:${sector}`,
        kind: "sector",
        label: sector,
        sublabel: `${members.length}개 활성 지갑의 공통 관심 섹터`,
        address: null,
        sector,
        status: (acceleration ?? 0) >= 1.75 ? "accelerating" : "accumulating",
        score,
        confidence: confidenceFromEvidence(members.length, members.length, exchanges.size),
        walletCount7d: members.length,
        walletCount30d: profiles.filter((profile) => profile.primarySector === sector).length,
        initiatedWalletCount7d: members.filter((profile) => profile.initiatedShare >= 0.2).length,
        top100WalletCount7d: top100.length,
        exchangeCount7d: exchanges.size,
        actionCount7d: actions7d,
        priorDailyBaseline: round(priorDailyBaseline, 2),
        recentDailyRate: round(recentDailyRate, 2),
        acceleration,
        inboundCount7d: 0,
        outboundCount7d: 0,
        estimatedNetUsd7d: null,
        topWallets: sorted.slice(0, 6).map((profile) => profile.address),
        thesis: `${sector} 관심 지갑 ${members.length}개가 최근 7일 의미 행동 ${actions7d}건을 남겼고, ${surging.length}개 지갑은 기존 기준선보다 활동이 확대됐습니다.`,
        caveat: "섹터는 토큰·컨트랙트 이름 기반 규칙형 분류이므로 프로젝트 공식 분류와 다를 수 있습니다.",
        evidenceUrls: sorted.flatMap((profile) => profile.notableMoves.slice(0, 1).map((move) => move.basescanUrl)).slice(0, 8),
        lastSeenAt: newestTimestamp(members.map((profile) => profile.latestActivityAt).filter((value): value is string => Boolean(value))),
      };
    })
    .sort((a, b) => b.score - a.score || b.walletCount7d - a.walletCount7d);
}

function buildBrief(input: {
  profiles: WalletResearchProfile[];
  themes: CohortTheme[];
  signals: IntelligenceSignal[];
  generatedAt: string;
  pricedFlowCoverage: number;
}) {
  const actionableThemes = input.themes.filter(
    (theme) => theme.status !== "passive_noise" && theme.score >= 50,
  );
  const topTheme = actionableThemes[0] ?? input.themes.find((theme) => theme.status !== "passive_noise");
  const crossExchangeTheme = actionableThemes.find((theme) => theme.exchangeCount7d >= 2);
  const priorityProfiles = input.profiles
    .filter((profile) => profile.researchPriority >= 60)
    .sort((a, b) => b.researchPriority - a.researchPriority);
  const topProfile = priorityProfiles[0] ?? [...input.profiles].sort((a, b) => b.researchPriority - a.researchPriority)[0];
  const highConfidence = priorityProfiles.filter((profile) => profile.evidenceConfidence === "high");
  const passiveNoise = input.themes.filter((theme) => theme.status === "passive_noise");
  const title = "QUID 코호트 데일리 인텔리전스";
  const headline = topTheme
    ? `${topTheme.label} 관련 활동이 가장 넓게 포착됐지만, 직접 행동 ${topTheme.initiatedWalletCount7d}개 지갑의 후속 흐름 확인이 필요합니다.`
    : "코호트에서 확신도 높은 신규 테마는 아직 제한적입니다.";
  const executiveSummary = [
    topTheme
      ? `${topTheme.label} 테마가 ${topTheme.score}점으로 선두입니다. 최근 7일 ${topTheme.walletCount7d}개 지갑이 참여했고 ${topTheme.exchangeCount7d}개 거래소 코호트에서 포착됐습니다.`
      : "현재 7일 구간에서 50점 이상 테마가 없어 개별 지갑 단위 추적이 우선입니다.",
    topProfile
      ? `${shortAddress(topProfile.address)}는 ${topProfile.personaLabel} 유형으로 분류되며 조사 우선순위 ${topProfile.researchPriority}점입니다. ${topProfile.recentChange}`
      : "우선 조사할 지갑 프로필이 아직 없습니다.",
    `${priorityProfiles.length}개 지갑이 60점 이상 조사 후보이며, 그중 ${highConfidence.length}개만 근거 신뢰도 HIGH입니다. 상위 수동 배포형 테마 ${passiveNoise.length}개는 알파에서 분리했습니다.`,
  ];
  const selectedThemes = [topTheme, crossExchangeTheme, actionableThemes.find((theme) => theme.kind === "protocol")]
    .filter((theme, index, values): theme is CohortTheme =>
      Boolean(theme) && values.findIndex((item) => item?.id === theme?.id) === index,
    )
    .slice(0, 3);
  const keyFindings = selectedThemes.map((theme) => ({
    id: `finding:${theme.id}`,
    title: `${theme.label} · ${theme.status}`,
    body: theme.thesis,
    implication: theme.status === "distributing"
      ? "추가 유출과 거래소 목적지 수렴 여부를 우선 확인해야 합니다."
      : "직접 행동 지갑이 같은 자산·컨트랙트에서 반복되는지 다음 수집 구간에 확인해야 합니다.",
    confidence: theme.confidence,
    walletAddresses: theme.topWallets,
    evidenceUrls: theme.evidenceUrls,
  }));
  if (topProfile && keyFindings.length < 3) {
    keyFindings.push({
      id: `finding:wallet:${topProfile.address}`,
      title: `${shortAddress(topProfile.address)} · ${topProfile.headline}`,
      body: topProfile.analystView,
      implication: topProfile.watchpoints[0] ?? "다음 직접 서명 행동을 확인해야 합니다.",
      confidence: topProfile.evidenceConfidence,
      walletAddresses: [topProfile.address],
      evidenceUrls: topProfile.notableMoves.slice(0, 3).map((move) => move.basescanUrl),
    });
  }
  return {
    asOf: input.generatedAt,
    title,
    headline,
    executiveSummary,
    keyFindings,
    priorityWallets: priorityProfiles.slice(0, 10).map((profile) => profile.address),
    nextChecks: [
      topTheme
        ? `${topTheme.label} 참여 지갑의 다음 24시간 직접 매수·민팅·컨트랙트 재호출 여부`
        : "신규 직접 매수·민팅·컨트랙트 호출 발생 여부",
      crossExchangeTheme
        ? `${crossExchangeTheme.label}의 업비트·빗썸 코호트 동시성 지속 여부`
        : "두 거래소 코호트에 동시에 나타나는 신규 관심 자산",
      `가격 산출 가능 흐름 비중 ${formatPercent(input.pricedFlowCoverage)} 개선 및 미가격 자산 원문 확인`,
    ],
    caveats: [
      "공개 체인 주소는 실소유자 한 명과 일대일 대응하지 않으며 동일 주체가 여러 주소를 운용할 수 있습니다.",
      "토큰 수신은 매수와 다르고 컨트랙트 호출은 투자 의도나 가격 상승을 보장하지 않습니다.",
      "섹터·페르소나는 최근 30일 행동을 규칙형으로 분류한 조사 보조 정보입니다.",
    ],
  };
}

export function buildWalletResearch(input: ResearchInput): WalletResearchDesk {
  const transfers = input.transfers ?? [];
  const transactions = input.transactions ?? [];
  const passiveDistributionAssets = detectPassiveDistributionAssets({
    transfers,
    transactions,
  });
  const trackedWallets = new Set(input.wallets.map((wallet) => wallet.address.toLowerCase()));
  const hotWallets = new Set(
    input.wallets.flatMap((wallet) => wallet.targetHotWallets.map((address) => address.toLowerCase())),
  );
  const signalsByWallet = new Map<string, IntelligenceSignal[]>();
  for (const signal of input.signals) {
    for (const wallet of signal.wallets) {
      const address = wallet.address.toLowerCase();
      const current = signalsByWallet.get(address) ?? [];
      current.push(signal);
      signalsByWallet.set(address, current);
    }
  }
  const profiles = input.wallets
    .map((wallet) => buildProfile({
      wallet,
      activities: input.activities,
      transfers,
      transactions,
      signals: signalsByWallet.get(wallet.address.toLowerCase()) ?? [],
      generatedAt: input.generatedAt,
      trackedWallets,
      hotWallets,
      passiveDistributionAssets,
    }))
    .sort(
      (a, b) =>
        b.researchPriority - a.researchPriority ||
        b.agencyScore - a.agencyScore ||
        b.meaningfulActions7d - a.meaningfulActions7d ||
        a.address.localeCompare(b.address),
    );
  const rankedThemes = [
    ...buildSectorThemes(profiles, input.wallets),
    ...buildProtocolThemes({ profiles, wallets: input.wallets }),
    ...buildAssetThemes({
      transfers,
      activities: input.activities,
      profiles,
      wallets: input.wallets,
      generatedAt: input.generatedAt,
    }),
  ]
    .sort(
      (a, b) =>
        Number(a.status === "passive_noise") - Number(b.status === "passive_noise") ||
        b.score - a.score ||
        b.initiatedWalletCount7d - a.initiatedWalletCount7d ||
        Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt),
    );
  const themes = [
    ...rankedThemes.filter((theme) => theme.status !== "passive_noise").slice(0, 30),
    ...rankedThemes.filter((theme) => theme.status === "passive_noise").slice(0, 20),
  ];
  const strategyClusters = buildClusters(profiles, input.wallets);
  const eligibleResearchTransfers = transfers.filter(
    (transfer) =>
      transfer.token.type === "ERC-20" &&
      transfer.token.address.toLowerCase() !== QUID_ADDRESS &&
      !passiveDistributionAssets.has(transfer.token.address.toLowerCase()) &&
      !isSpamTransfer(transfer),
  );
  const eligibleFlowCount = eligibleResearchTransfers.length;
  const pricedFlowCount = eligibleResearchTransfers.filter(
    (transfer) => knownUsd(transfer) !== null,
  ).length;
  const pricedFlowCoverage = eligibleFlowCount ? round(pricedFlowCount / eligibleFlowCount, 3) : 0;
  return {
    methodologyVersion: 1,
    brief: buildBrief({
      profiles,
      themes,
      signals: input.signals,
      generatedAt: input.generatedAt,
      pricedFlowCoverage,
    }),
    walletProfiles: profiles,
    themes,
    strategyClusters,
    metrics: {
      highPriorityWallets: profiles.filter((profile) => profile.researchPriority >= 70).length,
      highAgencyWallets: profiles.filter((profile) => profile.agencyScore >= 65).length,
      surgingWallets: profiles.filter((profile) => profile.momentum === "surging").length,
      activeThemes7d: themes.filter((theme) => theme.score >= 60 && theme.status !== "passive_noise").length,
      crossExchangeThemes7d: themes.filter((theme) => theme.exchangeCount7d >= 2 && theme.status !== "passive_noise").length,
      newlyExploredProtocols7d: new Set(
        profiles.flatMap((profile) => profile.protocols.filter((protocol) => protocol.isNew7d).map((protocol) => protocol.address.toLowerCase())),
      ).size,
      pricedFlowCoverage,
    },
  };
}

export const WALLET_RESEARCH_LABELS = {
  persona: Object.fromEntries(
    Object.entries(PERSONA_META).map(([key, value]) => [key, value.label]),
  ) as Record<WalletPersona, string>,
  momentum: MOMENTUM_LABELS,
  stance: STANCE_LABELS,
};
