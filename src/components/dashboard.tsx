"use client";

import {
  Activity,
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
import { CATEGORY_LABELS } from "@/lib/activity-labels";
import type {
  ActivityCategory,
  ActivityEvent,
  DashboardSnapshot,
  Exchange,
  IntelligenceSignal,
  SignalClass,
  SignalKind,
  WalletActivitySummary,
} from "@/lib/domain";
import styles from "./dashboard.module.css";

const SignalChart = dynamic(
  () => import("./activity-chart").then((module) => module.SignalChart),
  {
    ssr: false,
    loading: () => <div className={styles.chartLoading}>신호 차트 불러오는 중</div>,
  },
);

type Period = 1 | 7 | 30;
type ExchangeFilter = "all" | Exchange;
type SignalClassFilter = "all" | SignalClass;

export type DashboardData = Pick<
  DashboardSnapshot,
  | "generatedAt"
  | "source"
  | "coverage"
  | "metrics"
  | "wallets"
  | "activities"
  | "signals"
  | "assetWatchlist"
>;

const DAY_MS = 86_400_000;
const ACTIONABLE_SCORE = 70;

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

const SIGNAL_KIND_LABELS: Record<SignalKind, string> = {
  cohort_trade: "코호트 매수·민팅",
  cohort_accumulation: "코호트 순유입",
  coordinated_outflow: "동시 유출",
  distribution_blast: "대량 살포",
  wallet_activity_burst: "행동 급증",
  contract_convergence: "컨트랙트 수렴",
  bridge_follow_through: "브리지 후속 행동",
};

const SIGNAL_CLASS_LABELS: Record<SignalClass, string> = {
  alpha: "ALPHA",
  anomaly: "ANOMALY",
  noise: "NOISE",
};

const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
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

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1_000 ? 0 : 2,
    notation: value >= 1_000_000 ? "compact" : "standard",
  }).format(value);
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

function signalClassName(signalClass: SignalClass) {
  if (signalClass === "alpha") return styles.signalAlpha;
  if (signalClass === "anomaly") return styles.signalAnomaly;
  return styles.signalNoise;
}

function directionLabel(signal: IntelligenceSignal) {
  if (signal.direction === "bullish") return "상방 관찰";
  if (signal.direction === "bearish") return "하방·이탈 관찰";
  return "중립 조사";
}

function buildSignalChartData(
  signals: IntelligenceSignal[],
  period: Period,
  anchor: string,
) {
  const anchorTime = Date.parse(anchor);
  const points = new Map<
    string,
    { date: string; alpha: number; anomaly: number; noise: number }
  >();
  for (let offset = period - 1; offset >= 0; offset -= 1) {
    const date = KST_DATE_FORMATTER.format(new Date(anchorTime - offset * DAY_MS));
    points.set(date, { date, alpha: 0, anomaly: 0, noise: 0 });
  }
  for (const signal of signals) {
    const point = points.get(KST_DATE_FORMATTER.format(new Date(signal.occurredAt)));
    if (point) point[signal.signalClass] += 1;
  }
  return [...points.values()].map((point) => ({
    ...point,
    date: point.date.slice(5).replace("-", "/"),
  }));
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

function SignalBadge({ signal }: { signal: IntelligenceSignal }) {
  return (
    <span className={`${styles.signalBadge} ${signalClassName(signal.signalClass)}`}>
      {SIGNAL_CLASS_LABELS[signal.signalClass]} · {signal.score}
    </span>
  );
}

function SignalReasons({ signal }: { signal: IntelligenceSignal }) {
  return (
    <ul className={styles.reasonList}>
      {signal.reasons.slice(0, 6).map((reason) => (
        <li key={reason.code}>
          <b>{reason.points > 0 ? "+" : ""}{reason.points}</b>
          <span>{reason.label}</span>
        </li>
      ))}
    </ul>
  );
}

function PrioritySignal({
  signal,
  anchor,
}: {
  signal: IntelligenceSignal | null;
  anchor: string;
}) {
  if (!signal) {
    return (
      <section className={`${styles.prioritySignal} ${styles.priorityEmpty}`}>
        <div>
          <p className={styles.eyebrow}>PRIORITY SIGNAL</p>
          <h2>현재 조건에 맞는 유의미 신호가 없습니다.</h2>
          <span>점수 기준을 낮추거나 기간·거래소 필터를 넓혀 확인하세요.</span>
        </div>
      </section>
    );
  }

  return (
    <section className={`${styles.prioritySignal} ${signalClassName(signal.signalClass)}`}>
      <div className={styles.priorityLead}>
        <div className={styles.scoreDial} aria-label={`신호 점수 ${signal.score}점`}>
          <strong>{signal.score}</strong>
          <span>/ 100</span>
        </div>
        <div>
          <div className={styles.signalMeta}>
            <SignalBadge signal={signal} />
            <span>{SIGNAL_KIND_LABELS[signal.kind]}</span>
            <time>{relativeTime(signal.occurredAt, anchor)}</time>
          </div>
          <p className={styles.eyebrow}>HIGHEST PRIORITY / CURRENT FILTER</p>
          <h2>{signal.title}</h2>
          <p className={styles.prioritySummary}>{signal.summary}</p>
        </div>
      </div>
      <div className={styles.priorityFacts}>
        <dl>
          <div><dt>방향</dt><dd>{directionLabel(signal)}</dd></div>
          <div><dt>지갑</dt><dd>{signal.wallets.length}개</dd></div>
          <div><dt>거래소 코호트</dt><dd>{signal.exchangeCount}개</dd></div>
          <div><dt>추정 가치</dt><dd>{formatUsd(signal.estimatedUsd) ?? "미확인"}</dd></div>
        </dl>
        <SignalReasons signal={signal} />
        <div className={styles.signalLinks}>
          {signal.asset?.address ? (
            <a
              href={`https://basescan.org/token/${signal.asset.address}`}
              target="_blank"
              rel="noreferrer"
            >
              자산 확인 <ExternalLink size={13} />
            </a>
          ) : null}
          {signal.targetAddress ? (
            <a
              href={`https://basescan.org/address/${signal.targetAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              컨트랙트 확인 <ExternalLink size={13} />
            </a>
          ) : null}
          {signal.basescanUrls[0] ? (
            <a href={signal.basescanUrls[0]} target="_blank" rel="noreferrer">
              근거 트랜잭션 <ExternalLink size={13} />
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function WalletDrawer({
  wallet,
  activities,
  signals,
  generatedAt,
  onClose,
}: {
  wallet: WalletActivitySummary;
  activities: ActivityEvent[];
  signals: IntelligenceSignal[];
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
      <aside className={styles.drawer} onMouseDown={(event) => event.stopPropagation()}>
        <div className={styles.drawerHeader}>
          <div>
            <p>{wallet.exchange.toUpperCase()} / DEPOSIT RANK #{wallet.rank}</p>
            <h2 id="wallet-detail-title">지갑 인텔리전스</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="지갑 상세 닫기">
            <X size={20} />
          </button>
        </div>
        <div className={styles.addressBlock}>
          <code>{wallet.address}</code>
          <div>
            <button type="button" onClick={() => navigator.clipboard.writeText(wallet.address)}>
              <Copy size={14} /> 복사
            </button>
            <a href={`https://basescan.org/address/${wallet.address}`} target="_blank" rel="noreferrer">
              BaseScan <ExternalLink size={13} />
            </a>
          </div>
        </div>
        <dl className={styles.drawerStats}>
          <div><dt>7일 신호</dt><dd>{wallet.signalCount7d}</dd></div>
          <div><dt>최고 점수</dt><dd>{wallet.maxSignalScore || "–"}</dd></div>
          <div><dt>QUID 입금량</dt><dd>{formatQuid(wallet.depositAmountQuid)}</dd></div>
          <div><dt>마지막 활동</dt><dd>{relativeTime(wallet.lastActivityAt, generatedAt)}</dd></div>
        </dl>
        <section className={styles.drawerActivity}>
          <div className={styles.drawerSectionTitle}>
            <h3>연관 신호</h3>
            <span>{signals.length}건</span>
          </div>
          {signals.length ? (
            <ul>
              {signals.slice(0, 12).map((signal) => (
                <li key={signal.id}>
                  <div><SignalBadge signal={signal} /><time>{KST_FULL_FORMATTER.format(new Date(signal.occurredAt))}</time></div>
                  <strong>{signal.title}</strong>
                  <p>{signal.summary}</p>
                  <div className={styles.evidence}>{signal.evidence.map((item) => <span key={item}>{item}</span>)}</div>
                </li>
              ))}
            </ul>
          ) : <div className={styles.emptyBlock}>최근 30일 연관 신호가 없습니다.</div>}
        </section>
        <section className={styles.drawerActivity}>
          <div className={styles.drawerSectionTitle}>
            <h3>원문 활동</h3>
            <span>{activities.length}건</span>
          </div>
          {activities.length ? (
            <ul>
              {activities.slice(0, 24).map((item) => (
                <li key={item.id}>
                  <div>
                    <ActivityBadge category={item.category} />
                    <time>{KST_FULL_FORMATTER.format(new Date(item.occurredAt))}</time>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <a href={item.basescanUrl} target="_blank" rel="noreferrer">
                    트랜잭션 확인 <ArrowUpRight size={13} />
                  </a>
                </li>
              ))}
            </ul>
          ) : <div className={styles.emptyBlock}>표시할 원문 활동이 없습니다.</div>}
        </section>
      </aside>
    </dialog>
  );
}

export function Dashboard({
  data,
  logoutAction,
}: {
  data: DashboardData;
  logoutAction: () => Promise<void>;
}) {
  const [period, setPeriod] = useState<Period>(7);
  const [exchange, setExchange] = useState<ExchangeFilter>("all");
  const [signalClass, setSignalClass] = useState<SignalClassFilter>("all");
  const [minScore, setMinScore] = useState(50);
  const [query, setQuery] = useState("");
  const [top100Only, setTop100Only] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(60);
  const closeDrawer = useCallback(() => setSelectedAddress(null), []);
  const cutoff = Date.parse(data.generatedAt) - period * DAY_MS;
  const normalizedQuery = query.trim().toLowerCase();
  const walletByAddress = useMemo(
    () => new Map(data.wallets.map((wallet) => [wallet.address, wallet])),
    [data.wallets],
  );

  const visibleSignals = useMemo(
    () => data.signals
      .filter((signal) => Date.parse(signal.occurredAt) >= cutoff)
      .filter((signal) => signalClass === "all" || signal.signalClass === signalClass)
      .filter((signal) => signal.score >= minScore)
      .filter(
        (signal) =>
          exchange === "all" || signal.wallets.some((wallet) => wallet.exchange === exchange),
      )
      .filter(
        (signal) => !top100Only || signal.wallets.some((wallet) => wallet.inTop100),
      )
      .filter((signal) => {
        if (!normalizedQuery) return true;
        return [
          signal.title,
          signal.summary,
          signal.asset?.symbol,
          signal.asset?.name,
          signal.asset?.address,
          signal.targetAddress,
          ...signal.wallets.map((wallet) => wallet.address),
          ...signal.transactionHashes,
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedQuery));
      })
      .sort(
        (a, b) =>
          Number(b.signalClass !== "noise") - Number(a.signalClass !== "noise") ||
          b.score - a.score ||
          Date.parse(b.occurredAt) - Date.parse(a.occurredAt),
      ),
    [cutoff, data.signals, exchange, minScore, normalizedQuery, signalClass, top100Only],
  );

  const prioritySignal =
    visibleSignals.find((signal) => signal.signalClass !== "noise") ??
    visibleSignals[0] ??
    null;
  const signalChartData = useMemo(
    () => buildSignalChartData(visibleSignals, period, data.generatedAt),
    [data.generatedAt, period, visibleSignals],
  );
  const visibleAssetAddresses = useMemo(
    () => new Set(
      visibleSignals
        .filter((signal) => signal.asset)
        .map((signal) => signal.asset?.address.toLowerCase()),
    ),
    [visibleSignals],
  );
  const visibleWatchlist = data.assetWatchlist
    .filter((asset) => visibleAssetAddresses.has(asset.address.toLowerCase()))
    .slice(0, 10);

  const visibleActivities = useMemo(
    () => data.activities.filter((activity) => {
      if (Date.parse(activity.occurredAt) < cutoff) return false;
      if (exchange !== "all" && activity.exchange !== exchange) return false;
      if (top100Only && !walletByAddress.get(activity.walletAddress)?.inTop100) return false;
      if (!normalizedQuery) return true;
      return [
        activity.walletAddress,
        activity.title,
        activity.primaryAsset?.symbol,
        activity.primaryAsset?.name,
        activity.transactionHash,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedQuery));
    }),
    [cutoff, data.activities, exchange, normalizedQuery, top100Only, walletByAddress],
  );

  const visibleWallets = useMemo(
    () => data.wallets
      .filter((wallet) => exchange === "all" || wallet.exchange === exchange)
      .filter((wallet) => !top100Only || wallet.inTop100)
      .filter(
        (wallet) =>
          !normalizedQuery ||
          wallet.address.includes(normalizedQuery) ||
          wallet.topAssets.some((asset) => asset.toLowerCase().includes(normalizedQuery)),
      )
      .sort(
        (a, b) =>
          b.maxSignalScore - a.maxSignalScore ||
          b.signalCount24h - a.signalCount24h ||
          b.eventCount7d - a.eventCount7d ||
          Number(b.depositAmountQuid) - Number(a.depositAmountQuid),
      ),
    [data.wallets, exchange, normalizedQuery, top100Only],
  );

  const selectedWallet = selectedAddress
    ? data.wallets.find((wallet) => wallet.address === selectedAddress) ?? null
    : null;
  const selectedActivities = selectedAddress
    ? data.activities.filter((activity) => activity.walletAddress === selectedAddress)
    : [];
  const selectedSignals = selectedAddress
    ? data.signals.filter((signal) =>
        signal.wallets.some((wallet) => wallet.address === selectedAddress),
      )
    : [];

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <a href="#main-content" className={styles.skipLink}>본문으로 건너뛰기</a>
        <div className={styles.brand}>
          <span>KGW</span>
          <div><strong>KOREAN GOSU WALLET</strong><small>ALPHA SIGNAL INTELLIGENCE</small></div>
        </div>
        <div className={styles.topbarActions}>
          <span className={styles.privateBadge}><ShieldCheck size={14} /> PRIVATE</span>
          <form action={logoutAction}><button type="submit"><LogOut size={15} /> 로그아웃</button></form>
        </div>
      </header>

      <div className={styles.content} id="main-content">
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>ALPHA RADAR / QUID DEPOSIT COHORT</p>
            <h1>움직임이 아니라<br />의도를 찾는다.</h1>
            <p className={styles.heroCopy}>406개 거래소 입금 지갑의 집단 행동에서 매수·축적·신규 프로토콜 접근과 이례적 이탈을 먼저 포착합니다.</p>
          </div>
          <div className={styles.heroMeta}>
            <StatusDot degraded={data.source.degraded} />
            <dl>
              <div><dt>LAST SYNC</dt><dd>{KST_FULL_FORMATTER.format(new Date(data.generatedAt))} KST</dd></div>
              <div><dt>REFRESH</dt><dd>{data.source.refreshScope.toUpperCase()} / {data.source.refreshedWalletCount} WALLETS</dd></div>
              <div><dt>ACTIONABLE</dt><dd>SCORE {ACTIONABLE_SCORE}+</dd></div>
            </dl>
          </div>
        </section>

        {data.source.degraded ? (
          <section className={styles.warning} role="status">
            <CircleAlert size={17} />
            <div><strong>수집 또는 알림 상태를 확인하세요.</strong><span>{data.source.warnings[0] ?? `${data.source.failedWallets.length}개 지갑 수집 실패`}</span></div>
          </section>
        ) : null}

        <section className={styles.metricGrid} aria-label="알파 탐지 핵심 지표">
          <article className={styles.metricHot}>
            <div><Sparkles size={18} /><span>ACTIONABLE / 24H</span></div>
            <strong>{data.metrics.actionableSignals24h}</strong>
            <p>70점 이상 알파·이상 신호</p>
          </article>
          <article>
            <div><Database size={18} /><span>SIGNAL ASSETS / 7D</span></div>
            <strong>{data.metrics.signalAssets7d}</strong>
            <p>노이즈 제외 관찰 자산</p>
          </article>
          <article>
            <div><Activity size={18} /><span>ALPHA / 7D</span></div>
            <strong>{data.metrics.alphaSignals7d}</strong>
            <p>매수·축적·컨트랙트 수렴</p>
          </article>
          <article>
            <div><CircleAlert size={18} /><span>HIGH ANOMALY / 24H</span></div>
            <strong>{data.metrics.highAnomalies24h}</strong>
            <p>급증·동시 유출 70점 이상</p>
          </article>
        </section>

        <section className={styles.cohortNote}>
          <Users size={17} />
          <p>입금 요청 주소 <strong>{data.coverage.depositSenderWallets}개</strong> 중 내부 이동 {data.coverage.internalWalletsExcluded}개를 제외한 <strong>{data.coverage.trackedWallets}개</strong>를 추적합니다. 업비트·빗썸 공통 주소는 <strong>{data.coverage.crossExchangeOverlap}개</strong>이며, 최근 24시간 원문 {formatNumber(data.metrics.activities24h)}건 중 의미 행동은 {formatNumber(data.metrics.meaningfulActivities24h)}건으로 분리했습니다.</p>
        </section>

        <section className={`${styles.filters} ${styles.signalFilters}`} aria-label="신호 필터">
          <div className={styles.filterLabel}><Filter size={15} /> SIGNAL FILTER</div>
          <div className={styles.segmented} aria-label="기간 선택">
            {([1, 7, 30] as Period[]).map((value) => (
              <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>{value === 1 ? "24H" : `${value}D`}</button>
            ))}
          </div>
          <select value={signalClass} onChange={(event) => setSignalClass(event.target.value as SignalClassFilter)} aria-label="신호 종류">
            <option value="all">전체 신호</option><option value="alpha">알파</option><option value="anomaly">이상 행동</option><option value="noise">노이즈</option>
          </select>
          <select value={minScore} onChange={(event) => setMinScore(Number(event.target.value))} aria-label="최소 점수">
            <option value={0}>전체 점수</option><option value={50}>50+ 관찰</option><option value={70}>70+ 유의미</option><option value={85}>85+ 긴급</option>
          </select>
          <select value={exchange} onChange={(event) => setExchange(event.target.value as ExchangeFilter)} aria-label="거래소">
            <option value="all">전체 거래소</option><option value="Upbit">업비트 코호트</option><option value="Bithumb">빗썸 코호트</option>
          </select>
          <label className={styles.checkbox}><input type="checkbox" checked={top100Only} onChange={(event) => setTop100Only(event.target.checked)} />TOP100 포함</label>
          <label className={styles.search}><Search size={15} /><input aria-label="지갑·자산·트랜잭션 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="지갑·자산·컨트랙트 검색" /></label>
        </section>

        <PrioritySignal signal={prioritySignal} anchor={data.generatedAt} />

        <section className={`${styles.analyticsGrid} ${styles.intelligenceGrid}`}>
          <div className={styles.chartPanel}>
            <div className={styles.panelHeader}><div><p>SIGNAL PULSE</p><h2>신호 발생 흐름</h2></div><span>{visibleSignals.length} SIGNALS / {period === 1 ? "24H" : `${period}D`}</span></div>
            <div className={styles.chart} role="img" aria-label="알파, 이상 행동, 노이즈 신호 막대 차트">
              {visibleSignals.length ? <SignalChart data={signalChartData} /> : <div className={styles.emptyChart}>현재 필터에 맞는 신호가 없습니다.</div>}
            </div>
            <div className={styles.legend}><span><i className={styles.legendAlpha} />알파</span><span><i className={styles.legendAnomaly} />이상 행동</span><span><i className={styles.legendNoise} />노이즈</span></div>
          </div>

          <aside className={styles.watchPanel}>
            <div className={styles.panelHeader}><div><p>ASSET WATCHLIST</p><h2>집중 관찰 자산</h2></div><span>7D</span></div>
            {visibleWatchlist.length ? (
              <ol className={styles.watchList}>
                {visibleWatchlist.map((asset, index) => (
                  <li key={asset.address}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><strong>{asset.symbol || asset.name}</strong><small>{asset.walletCount} wallets · {asset.exchangeCount} cohort · {asset.signalCount} signals</small></div>
                    <b className={asset.direction === "bearish" ? styles.scoreBearish : styles.scoreBullish}>{asset.score}</b>
                    <a href={`https://basescan.org/token/${asset.address}`} target="_blank" rel="noreferrer" aria-label={`${asset.symbol} BaseScan 열기`}><ExternalLink size={14} /></a>
                  </li>
                ))}
              </ol>
            ) : <div className={styles.emptyBlock}>현재 조건에 맞는 관찰 자산이 없습니다.</div>}
          </aside>
        </section>

        <section className={styles.signalFeedPanel}>
          <div className={styles.panelHeader}><div><p>INTELLIGENCE QUEUE</p><h2>유의미·수상 행동 신호</h2></div><span>SCORE + REASONS + EVIDENCE</span></div>
          {visibleSignals.length ? (
            <ol className={styles.signalFeed}>
              {visibleSignals.slice(0, 30).map((signal) => (
                <li key={signal.id} className={signalClassName(signal.signalClass)}>
                  <div className={styles.signalScore}><strong>{signal.score}</strong><span>{signal.severity}</span></div>
                  <div className={styles.signalBody}>
                    <div className={styles.signalMeta}><SignalBadge signal={signal} /><span>{SIGNAL_KIND_LABELS[signal.kind]}</span><time>{KST_FULL_FORMATTER.format(new Date(signal.occurredAt))}</time></div>
                    <h3>{signal.title}</h3><p>{signal.summary}</p>
                    <div className={styles.signalEvidence}>{signal.evidence.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>
                  </div>
                  <div className={styles.signalCohort}><strong>{signal.wallets.length}</strong><span>WALLETS</span><small>{signal.exchangeCount} EXCHANGE COHORT</small><em>{directionLabel(signal)}</em></div>
                  <SignalReasons signal={signal} />
                  <div className={styles.signalRowLinks}>
                    {signal.wallets[0] ? <button type="button" onClick={() => setSelectedAddress(signal.wallets[0].address)}><code>{shortAddress(signal.wallets[0].address)}</code><ChevronRight size={14} /></button> : null}
                    {signal.basescanUrls[0] ? <a href={signal.basescanUrls[0]} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : <div className={styles.emptyBlock}>현재 필터에 맞는 신호가 없습니다.</div>}
        </section>

        <section className={styles.tablePanel}>
          <div className={styles.panelHeader}><div><p>WALLET ROSTER</p><h2>신호 우선 지갑 목록</h2></div><span>{visibleWallets.length} / {data.wallets.length} WALLETS</span></div>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>거래소 / 순위</th><th>지갑</th><th>최고 점수</th><th>신호 24H / 7D</th><th>활동 24H / 7D</th><th>주요 자산</th><th>마지막 활동</th><th aria-label="상세" /></tr></thead>
              <tbody>
                {visibleWallets.slice(0, visibleLimit).map((wallet) => (
                  <tr key={`${wallet.exchange}:${wallet.address}`} onClick={() => setSelectedAddress(wallet.address)}>
                    <td><span className={wallet.exchange === "Upbit" ? styles.upbit : styles.bithumb}>{wallet.exchange}</span><b>#{wallet.rank}</b></td>
                    <td><code>{shortAddress(wallet.address, 8, 6)}</code>{wallet.inTop100 ? <small>TOP 100</small> : null}</td>
                    <td><strong className={wallet.maxSignalScore >= 70 ? styles.scoreBullish : ""}>{wallet.maxSignalScore || "–"}</strong></td>
                    <td><strong>{wallet.signalCount24h}</strong><span> / {wallet.signalCount7d}</span></td>
                    <td><strong>{wallet.eventCount24h}</strong><span> / {wallet.eventCount7d}</span></td>
                    <td><div className={styles.assetTags}>{wallet.topAssets.length ? wallet.topAssets.map((asset) => <span key={asset}>{asset}</span>) : <small>–</small>}</div></td>
                    <td>{relativeTime(wallet.lastActivityAt, data.generatedAt)}</td>
                    <td><button type="button" aria-label={`${shortAddress(wallet.address)} 상세 보기`} onClick={(event) => { event.stopPropagation(); setSelectedAddress(wallet.address); }}><ChevronRight size={17} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleWallets.length > visibleLimit ? <div className={styles.tableFoot}><span>{visibleLimit}개 표시 중</span><button type="button" onClick={() => setVisibleLimit((current) => current + 60)}>60개 더 보기</button></div> : null}
        </section>

        <section className={styles.feedPanel}>
          <div className={styles.panelHeader}><div><p>EVIDENCE LAYER</p><h2>최근 원문 활동</h2></div><span>HEURISTIC SIGNAL ≠ VERIFIED INTENT</span></div>
          {visibleActivities.length ? (
            <ol className={styles.feed}>
              {visibleActivities.slice(0, 16).map((item) => (
                <li key={item.id}>
                  <time>{KST_FULL_FORMATTER.format(new Date(item.occurredAt))}</time>
                  <div className={styles.feedMain}><div><ActivityBadge category={item.category} /><span className={styles.confidence}>{item.confidence}</span>{item.suspectedSpam ? <span className={styles.riskFlag}>SPAM?</span> : null}{!item.initiatedByWallet ? <span className={styles.passiveFlag}>PASSIVE</span> : null}</div><strong>{item.title}</strong><p>{item.description}</p></div>
                  <button type="button" onClick={() => setSelectedAddress(item.walletAddress)}><code>{shortAddress(item.walletAddress)}</code></button>
                  <a href={item.basescanUrl} target="_blank" rel="noreferrer" aria-label="BaseScan에서 트랜잭션 열기"><ExternalLink size={16} /></a>
                </li>
              ))}
            </ol>
          ) : <div className={styles.emptyBlock}>현재 조건에 맞는 원문 활동이 없습니다.</div>}
        </section>

        <footer className={styles.footer}>
          <span>KGW / PRIVATE ALPHA RESEARCH</span>
          <p>신호는 공개 체인의 패턴 기반 휴리스틱이며 실소유자·불법성·매수 의도를 확정하지 않습니다. 점수 근거와 BaseScan 원문을 함께 검토하세요.</p>
        </footer>
      </div>

      {selectedWallet ? <WalletDrawer wallet={selectedWallet} activities={selectedActivities} signals={selectedSignals} generatedAt={data.generatedAt} onClose={closeDrawer} /> : null}
    </main>
  );
}
