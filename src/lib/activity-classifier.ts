import type {
  ActivityAsset,
  ActivityCategory,
  ActivityEvent,
  Exchange,
  NormalizedTransaction,
  NormalizedTransfer,
  TokenMetadata,
} from "./domain";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const PAYMENT_TOKEN_ADDRESSES = new Set([
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "0xd9aaec86b65d86f6a7b5aa1b0c42ffa531710b6ca",
  "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
  "0x4200000000000000000000000000000000000006",
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
]);

const METHOD_PATTERNS: Array<{
  pattern: RegExp;
  category: ActivityCategory;
  title: string;
}> = [
  {
    pattern: /bridge|deposittransaction|finalizewithdrawal/i,
    category: "bridge",
    title: "브리지 활동",
  },
  {
    pattern: /stake|unstake|delegate|claimreward|getreward/i,
    category: "staking",
    title: "스테이킹 활동",
  },
  {
    pattern: /addliquidity|removeliquidity|mint.*position|increase.*liquidity|decrease.*liquidity/i,
    category: "liquidity",
    title: "유동성 활동",
  },
];

function isNft(token: TokenMetadata) {
  return token.type === "ERC-721" || token.type === "ERC-1155";
}

function isPaymentAsset(token: TokenMetadata) {
  return PAYMENT_TOKEN_ADDRESSES.has(token.address.toLowerCase());
}

function isSuspectedSpam(transfer: NormalizedTransfer) {
  if (transfer.token.reputation?.toLowerCase() === "spam") return true;
  return /(?:https?:\/\/|t\.me|claim\s|visit\s|install\s|free\s+mint)/i.test(
    `${transfer.token.name} ${transfer.token.symbol}`,
  );
}

function toAsset(transfer: NormalizedTransfer): ActivityAsset {
  return {
    address: transfer.token.address,
    name: transfer.token.name,
    symbol: transfer.token.symbol,
    type: transfer.token.type,
    amount: transfer.amount,
    tokenId: transfer.tokenId,
  };
}

function nativeEthAsset(amount: string): ActivityAsset {
  return {
    address: "native:base-eth",
    name: "Ether",
    symbol: "ETH",
    type: "NATIVE",
    amount,
  };
}

function hasPositiveAmount(value: string | undefined) {
  if (!value) return false;
  const normalized = value.replace(".", "").replace(/^0+/, "");
  return normalized.length > 0;
}

function assetLabel(asset?: ActivityAsset | null) {
  if (!asset) return "알 수 없는 자산";
  if (asset.type === "ERC-721" || asset.type === "ERC-1155") {
    return asset.tokenId ? `${asset.name} #${asset.tokenId}` : asset.name;
  }
  const numericAmount = Number(asset.amount);
  const readableAmount = Number.isFinite(numericAmount)
    ? numericAmount !== 0 && Math.abs(numericAmount) < 0.000001
      ? "<0.000001"
      : new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(numericAmount)
    : asset.amount;
  return `${readableAmount ?? ""} ${asset.symbol}`.trim();
}

function txKey(walletAddress: string, transactionHash: string) {
  return `${walletAddress.toLowerCase()}:${transactionHash.toLowerCase()}`;
}

function makeActivity(input: {
  walletAddress: string;
  exchange: Exchange;
  transactionHash: string;
  blockNumber: number;
  occurredAt: string;
  category: ActivityCategory;
  confidence: ActivityEvent["confidence"];
  title: string;
  description: string;
  method?: string | null;
  primaryAsset?: ActivityAsset | null;
  counterAsset?: ActivityAsset | null;
  evidence: string[];
  initiatedByWallet: boolean;
  suspectedSpam: boolean;
  discriminator?: string | number | null;
}): ActivityEvent {
  const { discriminator, ...activity } = input;
  return {
    id: `${input.walletAddress.toLowerCase()}:${input.transactionHash.toLowerCase()}:${input.category}:${discriminator ?? "summary"}`,
    ...activity,
    basescanUrl: `https://basescan.org/tx/${input.transactionHash}`,
  };
}

export function classifyActivities(input: {
  walletExchange: Map<string, Exchange>;
  transfers: NormalizedTransfer[];
  transactions: NormalizedTransaction[];
}): ActivityEvent[] {
  const transfersByTransaction = new Map<string, NormalizedTransfer[]>();
  const transactionsByKey = new Map<string, NormalizedTransaction[]>();

  for (const transfer of input.transfers) {
    const key = txKey(transfer.walletAddress, transfer.transactionHash);
    const current = transfersByTransaction.get(key) ?? [];
    current.push(transfer);
    transfersByTransaction.set(key, current);
  }

  for (const transaction of input.transactions) {
    const key = txKey(transaction.walletAddress, transaction.transactionHash);
    const current = transactionsByKey.get(key) ?? [];
    current.push(transaction);
    transactionsByKey.set(key, current);
  }

  const allKeys = new Set([
    ...transfersByTransaction.keys(),
    ...transactionsByKey.keys(),
  ]);
  const activities: ActivityEvent[] = [];

  for (const key of allKeys) {
    const transfers = transfersByTransaction.get(key) ?? [];
    const transactionGroup = transactionsByKey.get(key) ?? [];
    const successfulTransactions = transactionGroup.filter((item) => item.status === "ok");
    const transaction =
      successfulTransactions.find((item) => item.source !== "internal") ??
      successfulTransactions[0];
    const reference = transfers[0] ?? transaction;
    if (!reference) continue;

    const walletAddress = reference.walletAddress.toLowerCase();
    const exchange = input.walletExchange.get(walletAddress);
    if (!exchange) continue;

    const method =
      transaction?.method ?? transfers.find((item) => item.method)?.method ?? null;
    const incoming = transfers.filter((item) => item.direction === "in");
    const outgoing = transfers.filter((item) => item.direction === "out");
    const nftIncoming = incoming.filter((item) => isNft(item.token));
    const nftOutgoing = outgoing.filter((item) => isNft(item.token));
    const tokenIncoming = incoming.filter((item) => !isNft(item.token));
    const tokenOutgoing = outgoing.filter((item) => !isNft(item.token));
    const paymentIncoming = tokenIncoming.find((item) => isPaymentAsset(item.token));
    const paymentOutgoing = tokenOutgoing.find((item) => isPaymentAsset(item.token));
    const nativeIncomingTransaction = successfulTransactions.find(
      (item) => item.direction === "in" && hasPositiveAmount(item.valueEth),
    );
    const nativeOutgoingTransaction = successfulTransactions.find(
      (item) => item.direction === "out" && hasPositiveAmount(item.valueEth),
    );
    const nativeIncoming = nativeIncomingTransaction
      ? nativeEthAsset(nativeIncomingTransaction.valueEth)
      : null;
    const nativeOutgoing = nativeOutgoingTransaction
      ? nativeEthAsset(nativeOutgoingTransaction.valueEth)
      : null;
    const incomingPaymentAsset = paymentIncoming ? toAsset(paymentIncoming) : nativeIncoming;
    const outgoingPaymentAsset = paymentOutgoing ? toAsset(paymentOutgoing) : nativeOutgoing;
    const acquiredTokens = tokenIncoming.filter((item) => !isPaymentAsset(item.token));
    const disposedTokens = tokenOutgoing.filter((item) => !isPaymentAsset(item.token));
    const mintedNfts = nftIncoming.filter(
      (item) => item.from.toLowerCase() === ZERO_ADDRESS,
    );

    const common = {
      walletAddress,
      exchange,
      transactionHash: reference.transactionHash,
      blockNumber: reference.blockNumber,
      occurredAt: reference.occurredAt,
      method,
      initiatedByWallet:
        outgoing.length > 0 ||
        successfulTransactions.some(
          (item) => item.source !== "internal" && item.direction === "out",
        ),
      suspectedSpam: transfers.some(isSuspectedSpam),
    };

    const matchedMethod = method
      ? METHOD_PATTERNS.find((item) => item.pattern.test(method))
      : undefined;
    if (matchedMethod) {
      const relatedTransfers = transfers.length > 0 ? transfers : [null];
      for (const relatedTransfer of relatedTransfers) {
        activities.push(
          makeActivity({
            ...common,
            discriminator: relatedTransfer?.id,
            category: matchedMethod.category,
            confidence: "medium",
            title: `${matchedMethod.title} 추정`,
            description: relatedTransfer
              ? `${method} 호출과 ${assetLabel(toAsset(relatedTransfer))} 이동이 확인됐습니다.`
              : `${method} 호출이 확인됐습니다.`,
            primaryAsset: relatedTransfer ? toAsset(relatedTransfer) : null,
            suspectedSpam: relatedTransfer ? isSuspectedSpam(relatedTransfer) : false,
            evidence: [
              `디코딩된 메서드: ${method}`,
              `동일 트랜잭션 자산 이동 ${transfers.length}건`,
            ],
          }),
        );
      }
      continue;
    }

    const airdroppedAssets = incoming.filter((item) =>
      /airdrop/i.test(item.method ?? method ?? ""),
    );
    if (airdroppedAssets.length > 0) {
      for (const airdroppedAsset of airdroppedAssets) {
        const primary = toAsset(airdroppedAsset);
        activities.push(
          makeActivity({
            ...common,
            discriminator: airdroppedAsset.id,
            category: "airdrop_received",
            confidence: "high",
            title: `${airdroppedAsset.token.symbol} 에어드롭 수신`,
            description: `${assetLabel(primary)} 유입 트랜잭션의 메서드가 airdrop으로 디코딩됐습니다.`,
            primaryAsset: primary,
            suspectedSpam: isSuspectedSpam(airdroppedAsset),
            evidence: ["디코딩된 메서드: airdrop", "동일 트랜잭션 내 토큰 유입"],
          }),
        );
      }
      continue;
    }

    if (mintedNfts.length > 0) {
      for (const mintedNft of mintedNfts) {
        const primary = toAsset(mintedNft);
        activities.push(
          makeActivity({
            ...common,
            discriminator: mintedNft.id,
            category: "nft_mint",
            confidence: "confirmed",
            title: `${mintedNft.token.name} 민팅`,
            description: `${assetLabel(primary)}가 0x0 주소에서 지갑으로 발행됐습니다.`,
            primaryAsset: primary,
            counterAsset: outgoingPaymentAsset,
            suspectedSpam: isSuspectedSpam(mintedNft),
            evidence: ["NFT 발신자가 0x0 주소", `토큰 표준: ${mintedNft.token.type}`],
          }),
        );
      }
      continue;
    }

    if (nftIncoming.length > 0 && outgoingPaymentAsset) {
      const counter = outgoingPaymentAsset;
      for (const acquiredNft of nftIncoming) {
        const primary = toAsset(acquiredNft);
        activities.push(
          makeActivity({
            ...common,
            discriminator: acquiredNft.id,
            category: "nft_purchase_candidate",
            confidence: "medium",
            title: `${acquiredNft.token.name} 매수 추정`,
            description: `${assetLabel(counter)} 유출과 ${assetLabel(primary)} 유입이 같은 거래에서 확인됐습니다.`,
            primaryAsset: primary,
            counterAsset: counter,
            suspectedSpam: isSuspectedSpam(acquiredNft),
            evidence: ["동일 트랜잭션 내 결제자산 유출", "동일 트랜잭션 내 NFT 유입"],
          }),
        );
      }
      continue;
    }

    if (nftOutgoing.length > 0 && incomingPaymentAsset) {
      const counter = incomingPaymentAsset;
      for (const disposedNft of nftOutgoing) {
        const primary = toAsset(disposedNft);
        activities.push(
          makeActivity({
            ...common,
            discriminator: disposedNft.id,
            category: "nft_sale_candidate",
            confidence: "medium",
            title: `${disposedNft.token.name} 매도 추정`,
            description: `${assetLabel(primary)} 유출과 ${assetLabel(counter)} 유입이 같은 거래에서 확인됐습니다.`,
            primaryAsset: primary,
            counterAsset: counter,
            suspectedSpam: isSuspectedSpam(disposedNft),
            evidence: ["동일 트랜잭션 내 NFT 유출", "동일 트랜잭션 내 결제자산 유입"],
          }),
        );
      }
      continue;
    }

    if (acquiredTokens.length > 0 && outgoingPaymentAsset) {
      const counter = outgoingPaymentAsset;
      for (const acquiredToken of acquiredTokens) {
        const primary = toAsset(acquiredToken);
        activities.push(
          makeActivity({
            ...common,
            discriminator: acquiredToken.id,
            category: "token_buy_candidate",
            confidence: "medium",
            title: `${acquiredToken.token.symbol} 매수 추정`,
            description: `${assetLabel(counter)} 유출과 ${assetLabel(primary)} 유입이 같은 거래에서 확인됐습니다.`,
            primaryAsset: primary,
            counterAsset: counter,
            suspectedSpam: isSuspectedSpam(acquiredToken),
            evidence: ["동일 트랜잭션 내 결제자산 유출", "동일 트랜잭션 내 비결제 토큰 유입"],
          }),
        );
      }
      continue;
    }

    if (disposedTokens.length > 0 && incomingPaymentAsset) {
      const counter = incomingPaymentAsset;
      for (const disposedToken of disposedTokens) {
        const primary = toAsset(disposedToken);
        activities.push(
          makeActivity({
            ...common,
            discriminator: disposedToken.id,
            category: "token_sell_candidate",
            confidence: "medium",
            title: `${disposedToken.token.symbol} 매도 추정`,
            description: `${assetLabel(primary)} 유출과 ${assetLabel(counter)} 유입이 같은 거래에서 확인됐습니다.`,
            primaryAsset: primary,
            counterAsset: counter,
            suspectedSpam: isSuspectedSpam(disposedToken),
            evidence: ["동일 트랜잭션 내 비결제 토큰 유출", "동일 트랜잭션 내 결제자산 유입"],
          }),
        );
      }
      continue;
    }

    if (method && /approve|setapprovalforall|permit/i.test(method)) {
      activities.push(
        makeActivity({
          ...common,
          category: "approval",
          confidence: "confirmed",
          title: "자산 사용 승인",
          description: `${method} 메서드 호출이 확인됐습니다.`,
          primaryAsset: transfers[0] ? toAsset(transfers[0]) : null,
          evidence: [`디코딩된 메서드: ${method}`],
        }),
      );
      continue;
    }

    if (transfers.length > 0) {
      for (const primaryTransfer of transfers) {
        const nft = isNft(primaryTransfer.token);
        const category: ActivityCategory = nft
          ? primaryTransfer.direction === "in"
            ? "nft_receive"
            : "nft_send"
          : primaryTransfer.direction === "in"
            ? "token_receive"
            : "token_send";
        const directionLabel = primaryTransfer.direction === "in" ? "수신" : "전송";
        const primary = toAsset(primaryTransfer);
        activities.push(
          makeActivity({
            ...common,
            discriminator: primaryTransfer.id,
            category,
            confidence: "confirmed",
            title: `${primaryTransfer.token.symbol || primaryTransfer.token.name} ${directionLabel}`,
            description: `${assetLabel(primary)} ${directionLabel}이 온체인에서 확인됐습니다.`,
            primaryAsset: primary,
            suspectedSpam: isSuspectedSpam(primaryTransfer),
            evidence: [`지갑 기준 ${primaryTransfer.direction === "in" ? "유입" : "유출"} Transfer 로그`],
          }),
        );
      }
      continue;
    }

    if (transaction && transaction.direction === "out" && transaction.to) {
      activities.push(
        makeActivity({
          ...common,
          category: "contract_interaction",
          confidence: "confirmed",
          title: method ? `${method} 호출` : "컨트랙트 상호작용",
          description: `${transaction.toName ? `${transaction.toName} (${transaction.to})` : transaction.to} 주소로 트랜잭션을 보냈습니다.`,
          evidence: ["지갑이 직접 서명한 아웃바운드 트랜잭션"],
        }),
      );
    }
  }

  return activities.sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
  );
}
