"use client";

import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Copy,
  Database,
  ExternalLink,
  Filter,
  LogOut,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActivityCategory,
  ActivityEvent,
  DashboardSnapshot,
  Exchange,
  WalletActivitySummary,
} from "@/lib/domain";
import { CATEGORY_LABELS } from "@/lib/snapshot";
import styles from "./dashboard.module.css";

const ActivityChart = dynamic(
  () => import("./activity-chart").then((module) => module.ActivityChart),
  { ssr: false, loading: () => <div className={styles.chartLoading}>차트 불러오는 중</div> },
);

type Period = 1 | 7 | 30;
type ExchangeFilter = "all" | Exchange;
type CategoryFilter = "all" | "buy" | "nft" | "defi" | "airdrop" | "transfer";

const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  airdrop_received: "purple",
  token_buy_candidate: "blue",
  token_sell_candidate: "pink",
  nft_purchase_candidate: "amber",
  nft_sale_candidate: "pink",
  nft_mint: "amber",
  token_receive: "blue",
  token_send: "slate",
  nft_receive: "amber",
  nft_send: "slate",
  bridge: "olive",
  staking: "olive",
  liquidity: "olive",
  approval: "slate",
  contract_interaction: "slate",
};

const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
});

const KST_FULL_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function shortAddress(address: string, head = 6, tail = 4) {
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatQuid(value: string) {
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 2,
    notation: Number(value) >= 1_000_000 ? "compact" : "standard",
  }).format(Number(value));
}

function relativeTime(timestamp: string | null, anchor: string) {
  if (!timestamp) return "활동 없음";
  const diffMinutes = Math.max(
    0,
    Math.floor((Date.parse(anchor) - Date.parse(timestamp)) / 60_000),
  );
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffMinutes < 1_440) return `${Math.floor(diffMinutes / 60)}시간 전`;
  return `${Math.floor(diffMinutes / 1_440)}일 전`;
}

function matchesCategory(category: ActivityCategory, filter: CategoryFilter) {
  if (filter === "all") return true;
  if (filter === "buy") {
    return category === "token_buy_candidate" || category === "nft_purchase_candidate";
  }
  if (filter === "nft") return category.startsWith("nft_");
  if (filter === "defi") return ["bridge", "staking", "liquidity"].includes(category);
  if (filter === "airdrop") return category === "airdrop_received";
  return ["token_receive", "token_send", "nft_receive", "nft_send"].includes(category);
}

function categoryBucket(category: ActivityCategory) {
  if (category.startsWith("token_") || category === "airdrop_received") return "token" as const;
  if (category.startsWith("nft_")) return "nft" as const;
  if (["bridge", "staking", "liquidity"].includes(category)) return "defi" as const;
  return "other" as const;
}

function buildChartData(activities: ActivityEvent[], period: Period, anchor: string) {
  const anchorTime = Date.parse(anchor);
  const points = new Map<
    string,
    { date: string; token: number; nft: number; defi: number; other: number }
  >();
  for (let offset = period - 1; offset >= 0; offset -= 1) {
    const date = KST_DATE_FORMATTER.format(new Date(anchorTime - offset * 86_400_000));
    points.set(date, { date, token: 0, nft: 0, defi: 0, other: 0 });
  }
  for (const item of activities) {
    const date = KST_DATE_FORMATTER.format(new Date(item.occurredAt));
    const point = points.get(date);
    if (point) point[categoryBucket(item.category)] += 1;
  }
  return [...points.values()];
}

function rankedAssets(
  activities: ActivityEvent[],
  predicate: (activity: ActivityEvent) => boolean,
) {
  const rows = new Map<
    string,
    { key: string; label: string; name: string; count: number; address: string }
  >();
  for (const activity of activities.filter(predicate)) {
    const asset = activity.primaryAsset;
    if (!asset) continue;
    const key = asset.address.toLowerCase();
    const row = rows.get(key);
    if (row) row.count += 1;
    else {
      rows.set(key, {
        key,
        label: asset.symbol || asset.name,
        name: asset.name,
        count: 1,
        address: asset.address,
      });
    }
  }
  return [...rows.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);
}

function StatusDot({ degraded }: { degraded: boolean }) {
  return (
    <span className={degraded ? styles.statusWarning : styles.statusOk}>
      {degraded ? <CircleAlert size={13} /> : <CheckCircle2 size={13} />}
      {degraded ? "수집 점검 필요" : "수집 정상"}
    </span>
  );
}

function ActivityBadge({ category }: { category: ActivityCategory }) {
  return (
    <span className={`${styles.activityBadge} ${styles[CATEGORY_COLORS[category]]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

function AssetRanking({
  title,
  eyebrow,
  rows,
  emptyText,
}: {
  title: string;
  eyebrow: string;
  rows: ReturnType<typeof rankedAssets>;
  emptyText: string;
}) {
  const max = rows[0]?.count ?? 1;
  return (
    <section className={styles.rankingPanel}>
      <div className={styles.panelHeader}>
        <div>
          <p>{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <span>{rows.length} ASSETS</span>
      </div>
      {rows.length ? (
        <ol className={styles.rankingList}>
          {rows.map((row, index) => (
            <li key={row.key}>
              <span className={styles.rankNumber}>{String(index + 1).padStart(2, "0")}</span>
              <div className={styles.rankBody}>
                <div className={styles.rankLabel}>
                  <strong>{row.label}</strong>
                  <small>{row.name}</small>
                </div>
                <div className={styles.rankTrack} aria-hidden="true">
                  <span style={{ width: `${Math.max(8, (row.count / max) * 100)}%` }} />
                </div>
              </div>
              <b>{row.count}</b>
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.emptyBlock}>{emptyText}</div>
      )}
    </section>
  );
}

function WalletDrawer({
  wallet,
  activities,
  generatedAt,
  onClose,
}: {
  wallet: WalletActivitySummary;
  activities: ActivityEvent[];
  generatedAt: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    closeButtonRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.drawerDialog}
      aria-labelledby="wallet-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className={styles.drawer}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.drawerHeader}>
          <div>
            <p>{wallet.exchange.toUpperCase()} / DEPOSIT RANK #{wallet.rank}</p>
            <h2 id="wallet-detail-title">지갑 상세</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="지갑 상세 닫기">
            <X size={20} />
          </button>
        </div>
        <div className={styles.addressBlock}>
          <code>{wallet.address}</code>
          <div>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(wallet.address)}
            >
              <Copy size={14} /> 복사
            </button>
            <a
              href={`https://basescan.org/address/${wallet.address}`}
              target="_blank"
              rel="noreferrer"
            >
              BaseScan <ExternalLink size={13} />
            </a>
          </div>
        </div>
        <dl className={styles.drawerStats}>
          <div>
            <dt>QUID 입금량</dt>
            <dd>{formatQuid(wallet.depositAmountQuid)}</dd>
          </div>
          <div>
            <dt>입금 트랜잭션</dt>
            <dd>{wallet.depositTransferCount}</dd>
          </div>
          <div>
            <dt>최근 7일 활동</dt>
            <dd>{wallet.eventCount7d}</dd>
          </div>
          <div>
            <dt>마지막 활동</dt>
            <dd>{relativeTime(wallet.lastActivityAt, generatedAt)}</dd>
          </div>
        </dl>
        <section className={styles.drawerActivity}>
          <div className={styles.drawerSectionTitle}>
            <h3>최근 판별 활동</h3>
            <span>{activities.length}건</span>
          </div>
          {activities.length ? (
            <ul>
              {activities.slice(0, 30).map((item) => (
                <li key={item.id}>
                  <div>
                    <ActivityBadge category={item.category} />
                    {item.suspectedSpam ? <span className={styles.riskFlag}>SPAM?</span> : null}
                    {!item.initiatedByWallet ? <span className={styles.passiveFlag}>PASSIVE</span> : null}
                    <time>{KST_FULL_FORMATTER.format(new Date(item.occurredAt))}</time>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <div className={styles.evidence}>
                    {item.evidence.map((evidence) => (
                      <span key={evidence}>{evidence}</span>
                    ))}
                  </div>
                  <a href={item.basescanUrl} target="_blank" rel="noreferrer">
                    트랜잭션 확인 <ArrowUpRight size={13} />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.emptyBlock}>선택 기간에 판별된 활동이 없습니다.</div>
          )}
        </section>
      </aside>
    </dialog>
  );
}

export function Dashboard({
  data,
  logoutAction,
}: {
  data: DashboardSnapshot;
  logoutAction: () => Promise<void>;
}) {
  const [period, setPeriod] = useState<Period>(7);
  const [exchange, setExchange] = useState<ExchangeFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [top100Only, setTop100Only] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(60);
  const closeDrawer = useCallback(() => setSelectedAddress(null), []);
  const cutoff = Date.parse(data.generatedAt) - period * 86_400_000;
  const walletByAddress = useMemo(
    () => new Map(data.wallets.map((wallet) => [wallet.address, wallet])),
    [data.wallets],
  );

  const visibleActivities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.activities.filter((item) => {
      if (Date.parse(item.occurredAt) < cutoff) return false;
      if (exchange !== "all" && item.exchange !== exchange) return false;
      if (top100Only && !walletByAddress.get(item.walletAddress)?.inTop100) return false;
      if (!matchesCategory(item.category, category)) return false;
      if (!normalizedQuery) return true;
      return [
        item.walletAddress,
        item.title,
        item.primaryAsset?.symbol,
        item.primaryAsset?.name,
        item.transactionHash,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [category, cutoff, data.activities, exchange, query, top100Only, walletByAddress]);

  const activityWallets = useMemo(
    () => new Set(visibleActivities.map((item) => item.walletAddress)),
    [visibleActivities],
  );

  const visibleWallets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return data.wallets
      .filter((wallet) => exchange === "all" || wallet.exchange === exchange)
      .filter((wallet) => !top100Only || wallet.inTop100)
      .filter(
        (wallet) =>
          !normalizedQuery ||
          wallet.address.includes(normalizedQuery) ||
          wallet.topAssets.some((asset) => asset.toLowerCase().includes(normalizedQuery)),
      )
      .sort((a, b) => {
        const aActive = activityWallets.has(a.address) ? 1 : 0;
        const bActive = activityWallets.has(b.address) ? 1 : 0;
        return bActive - aActive || b.eventCount7d - a.eventCount7d || Number(b.depositAmountQuid) - Number(a.depositAmountQuid);
      });
  }, [activityWallets, data.wallets, exchange, query, top100Only]);

  const filtersAreGlobal =
    exchange === "all" && category === "all" && !top100Only && query.trim() === "";

  const chartData = useMemo(
    () =>
      filtersAreGlobal
        ? data.dailyActivity.slice(-period).map((point) => ({
            ...point,
            date: point.date.slice(5).replace("-", "/"),
          }))
        : buildChartData(visibleActivities, period, data.generatedAt),
    [data.dailyActivity, data.generatedAt, filtersAreGlobal, period, visibleActivities],
  );
  const tokenRanking = useMemo(
    () =>
      filtersAreGlobal && period === 30
        ? data.topTokens.map((item) => ({
            key: item.key,
            label: item.label,
            name: item.sublabel ?? item.label,
            count: item.count,
            address: item.address ?? item.key,
          }))
        : rankedAssets(
            visibleActivities,
            (item) => item.category === "token_buy_candidate" && !item.suspectedSpam,
          ),
    [data.topTokens, filtersAreGlobal, period, visibleActivities],
  );
  const nftRanking = useMemo(
    () =>
      filtersAreGlobal && period === 30
        ? data.topNfts.map((item) => ({
            key: item.key,
            label: item.label,
            name: item.sublabel ?? item.label,
            count: item.count,
            address: item.address ?? item.key,
          }))
        : rankedAssets(
            visibleActivities,
            (item) => item.category.startsWith("nft_") && !item.suspectedSpam,
          ),
    [data.topNfts, filtersAreGlobal, period, visibleActivities],
  );
  const displayedEventCount = filtersAreGlobal
    ? period === 1
      ? data.metrics.activities24h
      : period === 7
        ? data.metrics.activities7d
        : data.metrics.activities30d
    : visibleActivities.length;
  const selectedWallet = selectedAddress
    ? data.wallets.find((wallet) => wallet.address === selectedAddress) ?? null
    : null;
  const selectedActivities = selectedAddress
    ? data.activities.filter((item) => item.walletAddress === selectedAddress)
    : [];

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <a href="#main-content" className={styles.skipLink}>본문으로 건너뛰기</a>
        <div className={styles.brand}>
          <span>KGW</span>
          <div>
            <strong>KOREAN GOSU WALLET</strong>
            <small>BASE ONCHAIN INTELLIGENCE</small>
          </div>
        </div>
        <div className={styles.topbarActions}>
          <span className={styles.privateBadge}>
            <ShieldCheck size={14} /> PRIVATE
          </span>
          <form action={logoutAction}>
            <button type="submit">
              <LogOut size={15} /> 로그아웃
            </button>
          </form>
        </div>
      </header>

      <div className={styles.content} id="main-content">
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>QUID DEPOSIT COHORT / 2026-08-04</p>
            <h1>거래소 입금 지갑군<br />활동 관제실</h1>
          </div>
          <div className={styles.heroMeta}>
            <StatusDot degraded={data.source.degraded} />
            <dl>
              <div><dt>LAST SYNC</dt><dd>{KST_FULL_FORMATTER.format(new Date(data.generatedAt))} KST</dd></div>
              <div><dt>CHAIN</dt><dd>BASE / 8453</dd></div>
              <div><dt>WINDOW</dt><dd>{data.source.trackingWindowDays} DAYS</dd></div>
            </dl>
          </div>
        </section>

        {data.source.degraded ? (
          <section className={styles.warning} role="status">
            <CircleAlert size={17} />
            <div>
              <strong>수집 상태를 확인하세요.</strong>
              <span>{data.source.warnings[0] ?? `${data.source.failedWallets.length}개 지갑 수집 실패`}</span>
            </div>
          </section>
        ) : null}

        <section className={styles.metricGrid} aria-label="핵심 지표">
          <article>
            <div><Users size={18} /><span>TRACKED EXTERNAL</span></div>
            <strong>{data.coverage.trackedWallets}</strong>
            <p>업비트 {data.coverage.upbitWallets} · 빗썸 {data.coverage.bithumbWallets}</p>
          </article>
          <article>
            <div><ArrowDownToLine size={18} /><span>DEPOSIT SENDERS</span></div>
            <strong>{data.coverage.depositSenderWallets}</strong>
            <p>업비트 {data.coverage.upbitDepositSenders} · 빗썸 {data.coverage.bithumbDepositSenders}</p>
          </article>
          <article>
            <div><Activity size={18} /><span>ACTIVE / 7D</span></div>
            <strong>{data.metrics.activeWallets7d}</strong>
            <p>{formatNumber(data.metrics.activities7d)}개 판별 활동</p>
          </article>
          <article>
            <div><Sparkles size={18} /><span>BUY SIGNAL / 30D</span></div>
            <strong>{data.metrics.inferredBuys30d}</strong>
            <p>에어드롭 {formatNumber(data.metrics.airdrops30d)} · NFT {formatNumber(data.metrics.nftActivities30d)}</p>
          </article>
        </section>

        <section className={styles.cohortNote}>
          <Database size={17} />
          <p>
            입금 발신 주소는 총 <strong>{data.coverage.depositSenderWallets}개</strong>입니다. 두 거래소 공통 주소는 <strong>{data.coverage.crossExchangeOverlap}개</strong>이며,
            거래소 내부 핫월렛 이동 {data.coverage.internalWalletsExcluded}개를 제외한 <strong>{data.coverage.trackedWallets}개</strong>를 추적합니다.
          </p>
        </section>

        <section className={styles.filters} aria-label="대시보드 필터">
          <div className={styles.filterLabel}><Filter size={15} /> FILTER</div>
          <div className={styles.segmented} aria-label="기간 선택">
            {([1, 7, 30] as Period[]).map((value) => (
              <button key={value} type="button" aria-pressed={period === value} onClick={() => { setPeriod(value); setVisibleLimit(60); }}>
                {value === 1 ? "24H" : `${value}D`}
              </button>
            ))}
          </div>
          <select value={exchange} onChange={(event) => { setExchange(event.target.value as ExchangeFilter); setVisibleLimit(60); }} aria-label="거래소">
            <option value="all">전체 거래소</option>
            <option value="Upbit">업비트</option>
            <option value="Bithumb">빗썸</option>
          </select>
          <select value={category} onChange={(event) => { setCategory(event.target.value as CategoryFilter); setVisibleLimit(60); }} aria-label="활동 유형">
            <option value="all">전체 활동</option>
            <option value="buy">매수 추정</option>
            <option value="nft">NFT</option>
            <option value="defi">DeFi</option>
            <option value="airdrop">에어드롭</option>
            <option value="transfer">단순 이동</option>
          </select>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={top100Only} onChange={(event) => { setTop100Only(event.target.checked); setVisibleLimit(60); }} />
            거래소별 TOP 100
          </label>
          <label className={styles.search}>
            <Search size={15} />
            <input aria-label="주소·토큰·트랜잭션 검색" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleLimit(60); }} placeholder="주소·토큰·트랜잭션 검색" />
          </label>
        </section>

        <section className={styles.analyticsGrid}>
          <div className={styles.chartPanel}>
            <div className={styles.panelHeader}>
              <div><p>ACTIVITY FLOW</p><h2>일별 활동 흐름</h2></div>
            <span>{displayedEventCount} EVENTS / {period === 1 ? "24H" : `${period}D`}</span>
            </div>
            <div className={styles.chart} role="img" aria-label={`${period}일간 토큰, NFT, 디파이, 기타 활동 막대 차트`}>
              {visibleActivities.length ? (
                <ActivityChart data={chartData} />
              ) : (
                <div className={styles.emptyChart}>선택 조건에 해당하는 활동이 없습니다.</div>
              )}
            </div>
            <div className={styles.legend}>
              <span><i className={styles.legendBlue} />토큰</span>
              <span><i className={styles.legendAmber} />NFT</span>
              <span><i className={styles.legendOlive} />DeFi</span>
              <span><i className={styles.legendPurple} />기타</span>
            </div>
          </div>

          <aside className={styles.signalPanel}>
            <div className={styles.panelHeader}>
              <div><p>SIGNAL QUALITY</p><h2>판정 원칙</h2></div>
            </div>
            <div className={styles.signalRule}>
              <span>01</span><div><strong>단순 유입 ≠ 매수</strong><p>토큰 수신만 있으면 ‘수신’으로 분류합니다.</p></div>
            </div>
            <div className={styles.signalRule}>
              <span>02</span><div><strong>결제 유출 + 자산 유입</strong><p>같은 거래에서 확인될 때만 ‘매수 추정’입니다.</p></div>
            </div>
            <div className={styles.signalRule}>
              <span>03</span><div><strong>근거를 함께 보존</strong><p>메서드, 자산 방향, 원문 트랜잭션을 연결합니다.</p></div>
            </div>
            <div className={styles.signalRule}>
              <span>04</span><div><strong>수동 유입은 PASSIVE</strong><p>지갑이 시작하지 않은 수신은 관심·매수와 분리합니다.</p></div>
            </div>
          </aside>
        </section>

        <section className={styles.rankingGrid}>
          <AssetRanking title="매수 추정 토큰" eyebrow="TOKEN ACCUMULATION" rows={tokenRanking} emptyText="선택 기간에 결제 흐름까지 확인된 토큰 매수가 없습니다." />
          <AssetRanking title="확인된 NFT 컬렉션" eyebrow="NFT COLLECTIONS" rows={nftRanking} emptyText="선택 기간에 확인된 NFT 활동이 없습니다." />
        </section>

        <section className={styles.tablePanel}>
          <div className={styles.panelHeader}>
            <div><p>WALLET ROSTER</p><h2>추적 지갑</h2></div>
            <span>{visibleWallets.length} / {data.wallets.length} WALLETS</span>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>거래소 / 순위</th><th>지갑</th><th>QUID 입금</th><th>활동 24H / 7D</th><th>주요 자산</th><th>마지막 활동</th><th aria-label="상세" /></tr></thead>
              <tbody>
                {visibleWallets.slice(0, visibleLimit).map((wallet) => (
                  <tr key={`${wallet.exchange}:${wallet.address}`} onClick={() => setSelectedAddress(wallet.address)}>
                    <td><span className={wallet.exchange === "Upbit" ? styles.upbit : styles.bithumb}>{wallet.exchange}</span><b>#{wallet.rank}</b></td>
                    <td><code>{shortAddress(wallet.address, 8, 6)}</code>{wallet.inTop100 ? <small>TOP 100</small> : null}</td>
                    <td><strong>{formatQuid(wallet.depositAmountQuid)}</strong><small>{wallet.depositTransferCount} tx</small></td>
                    <td><strong>{wallet.eventCount24h}</strong><span>/ {wallet.eventCount7d}</span></td>
                    <td><div className={styles.assetTags}>{wallet.topAssets.length ? wallet.topAssets.map((asset) => <span key={asset}>{asset}</span>) : <small>–</small>}</div></td>
                    <td>{relativeTime(wallet.lastActivityAt, data.generatedAt)}</td>
                    <td><button type="button" aria-label={`${shortAddress(wallet.address)} 상세 보기`} onClick={(event) => { event.stopPropagation(); setSelectedAddress(wallet.address); }}><ChevronRight size={17} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleWallets.length > visibleLimit ? (
            <div className={styles.tableFoot}>
              <span>{visibleLimit}개 표시 중 · 검색과 필터는 전체 {visibleWallets.length}개에 적용됩니다.</span>
              <button type="button" onClick={() => setVisibleLimit((current) => current + 60)}>
                60개 더 보기
              </button>
            </div>
          ) : null}
        </section>

        <section className={styles.feedPanel}>
          <div className={styles.panelHeader}>
            <div><p>LIVE CLASSIFICATION</p><h2>최근 활동</h2></div>
            <span>CONFIDENCE + EVIDENCE</span>
          </div>
          {visibleActivities.length ? (
            <ol className={styles.feed}>
              {visibleActivities.slice(0, 20).map((item) => (
                <li key={item.id}>
                  <time>{KST_FULL_FORMATTER.format(new Date(item.occurredAt))}</time>
                  <div className={styles.feedMain}>
                    <div>
                      <ActivityBadge category={item.category} />
                      <span className={styles.confidence}>{item.confidence}</span>
                      {item.suspectedSpam ? <span className={styles.riskFlag}>SPAM?</span> : null}
                      {!item.initiatedByWallet ? <span className={styles.passiveFlag}>PASSIVE</span> : null}
                    </div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedAddress(item.walletAddress)}><code>{shortAddress(item.walletAddress)}</code></button>
                  <a href={item.basescanUrl} target="_blank" rel="noreferrer" aria-label="BaseScan에서 트랜잭션 열기"><ExternalLink size={16} /></a>
                </li>
              ))}
            </ol>
          ) : <div className={styles.emptyBlock}>현재 필터에 맞는 최근 활동이 없습니다.</div>}
        </section>

        <footer className={styles.footer}>
          <span>KGW / PRIVATE RESEARCH SYSTEM</span>
          <p>최근 {formatNumber(data.metrics.activityRowsIncluded)}개 원문을 표시하며 집계는 전체 {formatNumber(data.metrics.activities30d)}건 기준입니다. 분류는 실소유자 식별을 의미하지 않습니다.</p>
        </footer>
      </div>

      {selectedWallet ? (
        <WalletDrawer wallet={selectedWallet} activities={selectedActivities} generatedAt={data.generatedAt} onClose={closeDrawer} />
      ) : null}
    </main>
  );
}
