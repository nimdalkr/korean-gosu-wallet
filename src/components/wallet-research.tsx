"use client";

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronRight,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  Layers,
  LoaderCircle,
  Network,
  Radar,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_LABELS } from "@/lib/activity-labels";
import type {
  ActivityEvent,
  CohortTheme,
  IntelligenceSignal,
  WalletActivitySummary,
  WalletMomentum,
  WalletPersona,
  WalletResearchDeskSummary,
  WalletResearchProfile,
  WalletResearchProfileSummary,
  WalletStance,
} from "@/lib/domain";
import styles from "./wallet-research.module.css";

const PERSONA_LABELS: Record<WalletPersona, string> = {
  active_trader: "능동 트레이더",
  token_operator: "토큰 운용·정리형",
  defi_operator: "DeFi 운용자",
  protocol_explorer: "프로토콜 탐색자",
  nft_collector: "NFT 컬렉터",
  airdrop_hunter: "에어드롭·클레임형",
  accumulator: "축적형 지갑",
  distributor: "분배·정리형",
  exchange_feeder: "거래소 송금형",
  multi_strategy: "멀티전략",
  passive_holder: "수동 보유·활동 미확인",
};

const MOMENTUM_LABELS: Record<WalletMomentum, string> = {
  surging: "급증",
  rising: "확대",
  stable: "유지",
  cooling: "둔화",
  inactive: "비활성",
};

const STANCE_LABELS: Record<WalletStance, string> = {
  accumulating: "순유입",
  distributing: "순유출",
  rotating: "회전",
  exploring: "탐색",
  monitoring: "관찰",
  inactive: "비활성",
};

const THEME_STATUS_LABELS: Record<CohortTheme["status"], string> = {
  emerging: "신규 부상",
  accelerating: "가속",
  accumulating: "축적",
  distributing: "유출 우세",
  fading: "둔화",
  passive_noise: "수동 배포",
};

const KST_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function shortAddress(address: string, head = 7, tail = 5) {
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    notation: Math.abs(value) >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined) return "가격 미확인";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 1 : 2,
  }).format(value);
}

function formatCoverage(value: number) {
  if (value > 0 && value < 0.01) return "<1%";
  return `${Math.round(value * 100)}%`;
}

function signed(value: number) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${formatCompact(value)}`;
}

function relativeTime(timestamp: string | null, anchor: string) {
  if (!timestamp) return "활동 없음";
  const minutes = Math.max(0, Math.floor((Date.parse(anchor) - Date.parse(timestamp)) / 60_000));
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1_440)}일 전`;
}

function priorityClass(score: number) {
  if (score >= 80) return styles.priorityCritical;
  if (score >= 70) return styles.priorityHigh;
  if (score >= 50) return styles.priorityMedium;
  return styles.priorityLow;
}

function momentumClass(momentum: WalletMomentum) {
  if (momentum === "surging") return styles.momentumHot;
  if (momentum === "rising") return styles.momentumRising;
  if (momentum === "cooling") return styles.momentumCooling;
  return styles.momentumNeutral;
}

function confidenceLabel(value: WalletResearchProfileSummary["evidenceConfidence"]) {
  return value === "high" ? "HIGH" : value === "medium" ? "MED" : "LOW";
}

function ThemeCard({
  theme,
  onSelectWallet,
}: {
  theme: CohortTheme;
  onSelectWallet: (address: string) => void;
}) {
  return (
    <article className={`${styles.themeCard} ${theme.status === "passive_noise" ? styles.themeNoise : ""}`}>
      <div className={styles.themeTopline}>
        <span>{theme.kind.toUpperCase()} / {theme.sector}</span>
        <strong className={priorityClass(theme.score)}>{theme.score}</strong>
      </div>
      <div className={styles.themeTitle}>
        <div>
          <span className={`${styles.themeStatus} ${styles[`theme_${theme.status}`]}`}>
            {THEME_STATUS_LABELS[theme.status]}
          </span>
          <h3>{theme.label}</h3>
          <p>{theme.sublabel}</p>
        </div>
        {theme.address ? (
          <a
            href={theme.kind === "asset"
              ? `https://basescan.org/token/${theme.address}`
              : `https://basescan.org/address/${theme.address}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`${theme.label} BaseScan 열기`}
          >
            <ExternalLink size={15} />
          </a>
        ) : null}
      </div>
      <p className={styles.themeThesis}>{theme.thesis}</p>
      <dl className={styles.themeStats}>
        <div><dt>7D 지갑</dt><dd>{theme.walletCount7d}</dd></div>
        <div><dt>직접 행동</dt><dd>{theme.initiatedWalletCount7d}</dd></div>
        <div><dt>코호트</dt><dd>{theme.exchangeCount7d}</dd></div>
        <div><dt>가속도</dt><dd>{theme.acceleration === null ? "NEW" : `${theme.acceleration.toFixed(1)}×`}</dd></div>
      </dl>
      <div className={styles.themeWallets}>
        {theme.topWallets.slice(0, 4).map((address) => (
          <button key={address} type="button" onClick={() => onSelectWallet(address)}>
            {shortAddress(address)}
          </button>
        ))}
      </div>
      <p className={styles.themeCaveat}><AlertTriangle size={12} />{theme.caveat}</p>
    </article>
  );
}

function ResearchBook({
  research,
  wallets,
  generatedAt,
  onSelectWallet,
}: {
  research: WalletResearchDeskSummary;
  wallets: WalletActivitySummary[];
  generatedAt: string;
  onSelectWallet: (address: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [persona, setPersona] = useState<"all" | WalletPersona>("all");
  const [minimumPriority, setMinimumPriority] = useState(0);
  const [limit, setLimit] = useState(60);
  const walletByAddress = useMemo(
    () => new Map(wallets.map((wallet) => [wallet.address.toLowerCase(), wallet])),
    [wallets],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const profiles = useMemo(
    () => research.walletProfiles
      .filter((profile) => persona === "all" || profile.persona === persona)
      .filter((profile) => profile.researchPriority >= minimumPriority)
      .filter((profile) => {
        if (!normalizedQuery) return true;
        const wallet = walletByAddress.get(profile.address);
        return [
          profile.address,
          profile.headline,
          profile.primarySector,
          profile.personaLabel,
          wallet?.exchange,
          ...profile.secondaryTags,
          ...profile.interests.map((interest) => interest.label),
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedQuery));
      }),
    [minimumPriority, normalizedQuery, persona, research.walletProfiles, walletByAddress],
  );

  return (
    <section className={styles.bookSection} id="wallet-research-book">
      <div className={styles.sectionHeader}>
        <div>
          <p>WALLET RESEARCH BOOK</p>
          <h2>{research.walletProfiles.length}개 지갑 애널리스트 프로필</h2>
          <span>성향 · 관심 섹터 · 최근 변화 · 근거 신뢰도 · 다음 관찰 포인트</span>
        </div>
        <strong>{profiles.length} / {research.walletProfiles.length}</strong>
      </div>
      <div className={styles.bookFilters}>
        <label>
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="주소·섹터·자산·페르소나 검색"
            aria-label="지갑 리서치 검색"
          />
        </label>
        <select value={persona} onChange={(event) => setPersona(event.target.value as "all" | WalletPersona)} aria-label="지갑 유형">
          <option value="all">전체 투자 유형</option>
          {Object.entries(PERSONA_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select value={minimumPriority} onChange={(event) => setMinimumPriority(Number(event.target.value))} aria-label="최소 조사 우선순위">
          <option value={0}>전체 우선순위</option>
          <option value={50}>50+ 관찰</option>
          <option value={60}>60+ 조사 후보</option>
          <option value={70}>70+ 우선 조사</option>
          <option value={80}>80+ 즉시 확인</option>
        </select>
      </div>
      <ol className={styles.profileList}>
        {profiles.slice(0, limit).map((profile) => {
          const wallet = walletByAddress.get(profile.address);
          return (
            <li key={profile.address}>
              <button type="button" className={styles.profileRow} onClick={() => onSelectWallet(profile.address)}>
                <div className={`${styles.profilePriority} ${priorityClass(profile.researchPriority)}`}>
                  <strong>{profile.researchPriority}</strong>
                  <span>PRIORITY</span>
                </div>
                <div className={styles.profileIdentity}>
                  <div>
                    <span className={wallet?.exchange === "Upbit" ? styles.upbit : styles.bithumb}>
                      {wallet?.exchange ?? "–"}
                    </span>
                    <b>#{wallet?.rank ?? "–"}</b>
                    {wallet?.inTop100 ? <em>TOP100</em> : null}
                  </div>
                  <code>{shortAddress(profile.address, 9, 7)}</code>
                  <small>{relativeTime(profile.latestActivityAt, generatedAt)}</small>
                </div>
                <div className={styles.profileThesis}>
                  <span>{profile.personaLabel}</span>
                  <strong>{profile.headline}</strong>
                  <p>{profile.recentChange}</p>
                </div>
                <div className={styles.profileInterests}>
                  <small>관심 분야</small>
                  <strong>{profile.primarySector}</strong>
                  <div>
                    {profile.interests
                      .filter((interest) => interest.kind !== "sector")
                      .slice(0, 3)
                      .map((interest) => <span key={interest.key}>{interest.label}</span>)}
                  </div>
                </div>
                <div className={styles.profileChange}>
                  <span className={momentumClass(profile.momentum)}>
                    <TrendingUp size={13} /> {MOMENTUM_LABELS[profile.momentum]}
                  </span>
                  <strong>{STANCE_LABELS[profile.stance]}</strong>
                  <small>7D 의미 행동 {profile.meaningfulActions7d}건</small>
                </div>
                <div className={styles.profileEvidence}>
                  <span>AGENCY <b>{profile.agencyScore}</b></span>
                  <span>DEPTH <b>{profile.sophisticationScore}</b></span>
                  <span>CONF <b>{confidenceLabel(profile.evidenceConfidence)}</b></span>
                </div>
                <ChevronRight className={styles.profileChevron} size={19} />
              </button>
            </li>
          );
        })}
      </ol>
      {profiles.length === 0 ? <div className={styles.empty}>조건에 맞는 지갑 프로필이 없습니다.</div> : null}
      {profiles.length > limit ? (
        <div className={styles.loadMore}>
          <span>{limit}개 표시 중</span>
          <button type="button" onClick={() => setLimit((current) => current + 60)}>60개 더 보기</button>
        </div>
      ) : null}
    </section>
  );
}

export function ResearchDesk({
  research,
  wallets,
  generatedAt,
  onSelectWallet,
}: {
  research: WalletResearchDeskSummary;
  wallets: WalletActivitySummary[];
  generatedAt: string;
  onSelectWallet: (address: string) => void;
}) {
  const walletByAddress = useMemo(
    () => new Map(wallets.map((wallet) => [wallet.address.toLowerCase(), wallet])),
    [wallets],
  );
  const topThemes = research.themes.filter((theme) => theme.status !== "passive_noise").slice(0, 8);
  const priorityProfiles = research.brief.priorityWallets
    .map((address) => research.walletProfiles.find((profile) => profile.address === address))
    .filter((profile): profile is WalletResearchProfileSummary => Boolean(profile))
    .slice(0, 7);
  const largestCluster = Math.max(1, ...research.strategyClusters.map((cluster) => cluster.walletCount));

  return (
    <div className={styles.researchDesk}>
      <nav className={styles.researchNav} aria-label="리서치 섹션 바로가기">
        <a href="#daily-brief"><BookOpen size={14} /> 데일리 브리핑</a>
        <a href="#alpha-themes"><Radar size={14} /> 알파 테마</a>
        <a href="#strategy-map"><Layers size={14} /> 지갑 전략군</a>
        <a href="#wallet-research-book"><Wallet size={14} /> 지갑 리포트</a>
        <a href="#signal-evidence"><ShieldCheck size={14} /> 신호·근거</a>
      </nav>

      <section className={styles.brief} id="daily-brief">
        <article className={styles.briefMain}>
          <div className={styles.reportMasthead}>
            <div><BookOpen size={18} /><span>KGW RESEARCH / DAILY NOTE</span></div>
            <time>{KST_FORMATTER.format(new Date(research.brief.asOf))} KST</time>
          </div>
          <p className={styles.reportLabel}>EXECUTIVE SUMMARY</p>
          <h2>{research.brief.title}</h2>
          <h3>{research.brief.headline}</h3>
          <ol className={styles.executiveSummary}>
            {research.brief.executiveSummary.map((item, index) => (
              <li key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{item}</p>
              </li>
            ))}
          </ol>
          <div className={styles.findings}>
            {research.brief.keyFindings.map((finding) => (
              <article key={finding.id}>
                <div>
                  <span className={styles[`confidence_${finding.confidence}`]}>{finding.confidence.toUpperCase()}</span>
                  <h4>{finding.title}</h4>
                </div>
                <p>{finding.body}</p>
                <strong>SO WHAT — {finding.implication}</strong>
                <div>
                  {finding.walletAddresses.slice(0, 3).map((address) => (
                    <button key={address} type="button" onClick={() => onSelectWallet(address)}>{shortAddress(address)}</button>
                  ))}
                  {finding.evidenceUrls[0] ? (
                    <a href={finding.evidenceUrls[0]} target="_blank" rel="noreferrer">근거 원문 <ArrowUpRight size={12} /></a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </article>

        <aside className={styles.briefAside}>
          <div className={styles.asideTitle}>
            <Target size={16} />
            <div><span>PRIORITY COVERAGE</span><h3>오늘 먼저 볼 지갑</h3></div>
          </div>
          <ol className={styles.priorityWallets}>
            {priorityProfiles.map((profile, index) => {
              const wallet = walletByAddress.get(profile.address);
              return (
                <li key={profile.address}>
                  <button type="button" onClick={() => onSelectWallet(profile.address)}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{shortAddress(profile.address)}</strong>
                      <small>{wallet?.exchange} #{wallet?.rank} · {profile.personaLabel}</small>
                      <p>{profile.headline}</p>
                    </div>
                    <b className={priorityClass(profile.researchPriority)}>{profile.researchPriority}</b>
                    <ChevronRight size={15} />
                  </button>
                </li>
              );
            })}
          </ol>
          <div className={styles.nextChecks}>
            <span>NEXT CHECKS</span>
            <ul>{research.brief.nextChecks.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </aside>
      </section>

      <section className={styles.researchMetrics} aria-label="지갑 리서치 핵심 지표">
        <article><Target size={17} /><span>우선 조사</span><strong>{research.metrics.highPriorityWallets}</strong><p>70점 이상 지갑</p></article>
        <article><ShieldCheck size={17} /><span>높은 주도성</span><strong>{research.metrics.highAgencyWallets}</strong><p>Agency 65+</p></article>
        <article><TrendingUp size={17} /><span>활동 급증</span><strong>{research.metrics.surgingWallets}</strong><p>7D 기준선 상회</p></article>
        <article><Radar size={17} /><span>강한 테마</span><strong>{research.metrics.activeThemes7d}</strong><p>Score 60+</p></article>
        <article><Users size={17} /><span>교차 코호트</span><strong>{research.metrics.crossExchangeThemes7d}</strong><p>업비트+빗썸</p></article>
        <article><DollarSign size={17} /><span>가격 커버리지</span><strong>{formatCoverage(research.metrics.pricedFlowCoverage)}</strong><p>USD 추정 가능</p></article>
      </section>

      <section className={styles.themeSection} id="alpha-themes">
        <div className={styles.sectionHeader}>
          <div>
            <p>COHORT ALPHA MAP</p>
            <h2>지갑들이 함께 움직인 곳</h2>
            <span>최근 7일 참여 폭·직접 행동·가속도·거래소 교차를 합산한 조사 우선순위</span>
          </div>
          <strong>{topThemes.length} THEMES</strong>
        </div>
        <div className={styles.themeGrid}>
          {topThemes.map((theme) => <ThemeCard key={theme.id} theme={theme} onSelectWallet={onSelectWallet} />)}
        </div>
      </section>

      <section className={styles.clusterSection} id="strategy-map">
        <div className={styles.sectionHeader}>
          <div>
            <p>BEHAVIORAL STRATEGY MAP</p>
            <h2>지갑 운용 전략군</h2>
            <span>최근 30일 직접 행동·자산 흐름·프로토콜 깊이 기반 분류</span>
          </div>
          <strong>{research.strategyClusters.length} CLUSTERS</strong>
        </div>
        <div className={styles.clusterGrid}>
          {research.strategyClusters.map((cluster) => (
            <article key={cluster.id}>
              <div className={styles.clusterHeading}>
                <div><span>{cluster.label}</span><strong>{cluster.walletCount}</strong></div>
                <small>{Math.round(cluster.walletShare * 100)}% OF COHORT</small>
              </div>
              <div className={styles.clusterBar}><i style={{ width: `${(cluster.walletCount / largestCluster) * 100}%` }} /></div>
              <p>{cluster.description}</p>
              <dl>
                <div><dt>7D 활성</dt><dd>{cluster.activeWallets7d}</dd></div>
                <div><dt>평균 Priority</dt><dd>{cluster.averagePriority}</dd></div>
                <div><dt>평균 Agency</dt><dd>{cluster.averageAgency}</dd></div>
              </dl>
              <div className={styles.clusterTags}>
                {cluster.topSectors.map((sector) => <span key={sector}>{sector}</span>)}
                {cluster.topAssets.map((asset) => <em key={asset}>{asset}</em>)}
              </div>
              <div className={styles.clusterWallets}>
                {cluster.representativeWallets.slice(0, 3).map((address) => (
                  <button key={address} type="button" onClick={() => onSelectWallet(address)}>{shortAddress(address)}</button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <ResearchBook
        research={research}
        wallets={wallets}
        generatedAt={generatedAt}
        onSelectWallet={onSelectWallet}
      />
    </div>
  );
}

function DossierTrend({ profile }: { profile: WalletResearchProfile }) {
  const maximum = Math.max(1, ...profile.trend14d.map((point) => point.meaningful));
  return (
    <div className={styles.dossierTrend} role="img" aria-label="최근 14일 의미 행동 추이">
      {profile.trend14d.map((point) => (
        <div key={point.date} title={`${point.date}: 의미 행동 ${point.meaningful}건`}>
          <span><i style={{ height: `${Math.max(3, (point.meaningful / maximum) * 100)}%` }} /></span>
          <small>{point.date.slice(5).replace("-", "/")}</small>
        </div>
      ))}
    </div>
  );
}

function DossierBehaviorMix({ profile }: { profile: WalletResearchProfile }) {
  const maximum = Math.max(1, ...profile.behaviorMix.map((item) => item.count30d));
  if (profile.behaviorMix.length === 0) {
    return <div className={styles.empty}>QUID와 스팸을 제외한 분류 가능 활동이 없습니다.</div>;
  }
  return (
    <ol className={styles.behaviorMix}>
      {profile.behaviorMix.slice(0, 8).map((item) => (
        <li key={item.category}>
          <div>
            <strong>{CATEGORY_LABELS[item.category]}</strong>
            <span>{Math.round(item.share * 100)}%</span>
          </div>
          <div className={styles.behaviorBar}>
            <i style={{ width: `${Math.max(3, (item.count30d / maximum) * 100)}%` }} />
          </div>
          <dl>
            <div><dt>7D</dt><dd>{item.count7d}</dd></div>
            <div><dt>30D</dt><dd>{item.count30d}</dd></div>
            <div><dt>직접</dt><dd>{item.initiatedCount30d}</dd></div>
          </dl>
        </li>
      ))}
    </ol>
  );
}

export function WalletDossier({
  profile,
  wallet,
  activities,
  signals,
  generatedAt,
  error,
  onRetry,
  onClose,
}: {
  profile: WalletResearchProfile | null;
  wallet: WalletActivitySummary;
  activities: ActivityEvent[];
  signals: IntelligenceSignal[];
  generatedAt: string;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    closeRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      previous?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dossierDialog}
      aria-labelledby="dossier-title"
      aria-busy={!profile && !error}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      {profile ? (
        <article className={styles.dossier} onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.dossierHeader}>
          <div className={`${styles.dossierScore} ${priorityClass(profile.researchPriority)}`}>
            <strong>{profile.researchPriority}</strong><span>RESEARCH<br />PRIORITY</span>
          </div>
          <div className={styles.dossierTitle}>
            <p>{wallet.exchange.toUpperCase()} / QUID DEPOSIT RANK #{wallet.rank} / {profile.personaLabel}</p>
            <h2 id="dossier-title">{profile.headline}</h2>
            <div>
              <code>{wallet.address}</code>
              <button type="button" onClick={() => navigator.clipboard.writeText(wallet.address)}><Copy size={13} /> 복사</button>
              <a href={`https://basescan.org/address/${wallet.address}`} target="_blank" rel="noreferrer">BaseScan <ExternalLink size={12} /></a>
            </div>
          </div>
          <button ref={closeRef} className={styles.dossierClose} type="button" onClick={onClose} aria-label="지갑 리포트 닫기"><X size={20} /></button>
        </header>

        <section className={styles.dossierExecutive}>
          <div>
            <span>ANALYST VIEW</span>
            <p>{profile.analystView}</p>
            <strong>{profile.recentChange}</strong>
          </div>
          <dl>
            <div><dt>운용 태도</dt><dd>{STANCE_LABELS[profile.stance]}</dd></div>
            <div><dt>활동 변화</dt><dd>{MOMENTUM_LABELS[profile.momentum]}{profile.momentumRatio !== null ? ` ${profile.momentumRatio.toFixed(1)}×` : ""}</dd></div>
            <div><dt>주력 관심</dt><dd>{profile.primarySector}</dd></div>
            <div><dt>근거 신뢰도</dt><dd>{confidenceLabel(profile.evidenceConfidence)}</dd></div>
          </dl>
        </section>

        <section className={styles.dossierScoreboard}>
          <article><ShieldCheck size={16} /><span>Agency</span><strong>{profile.agencyScore}</strong><p>직접 서명·주도 행동</p></article>
          <article><Layers size={16} /><span>Depth</span><strong>{profile.sophisticationScore}</strong><p>프로토콜·전략 깊이</p></article>
          <article><Activity size={16} /><span>Meaningful / 7D</span><strong>{profile.meaningfulActions7d}</strong><p>30D {profile.meaningfulActions30d}건</p></article>
          <article><Network size={16} /><span>Counterparties</span><strong>{profile.uniqueCounterparties30d}</strong><p>프로토콜 {profile.uniqueProtocols30d}개</p></article>
          <article><DollarSign size={16} /><span>Known flow / 30D</span><strong>{formatUsd(profile.knownFlowUsd30d)}</strong><p>가격 커버리지 {formatCoverage(profile.pricingCoverage)}</p></article>
        </section>

        <section className={styles.dossierSection}>
          <div className={styles.dossierSectionHeader}>
            <div><BarChart3 size={16} /><span>14-DAY BEHAVIOR TAPE</span><h3>최근 행동 리듬</h3></div>
            <small>막대는 일별 의미 행동 수</small>
          </div>
          <DossierTrend profile={profile} />
          <div className={styles.fingerprintTags}>{profile.flags.map((flag) => <span key={flag}>{flag}</span>)}</div>
        </section>

        <section className={styles.dossierSection}>
          <div className={styles.dossierSectionHeader}>
            <div><Activity size={16} /><span>BEHAVIOR MIX</span><h3>이 지갑이 주로 하는 행동</h3></div>
            <small>QUID·스팸 제외, 직접은 지갑이 시작한 트랜잭션</small>
          </div>
          <DossierBehaviorMix profile={profile} />
        </section>

        <div className={styles.dossierColumns}>
          <section className={styles.dossierSection}>
            <div className={styles.dossierSectionHeader}><div><Radar size={16} /><span>INTEREST FINGERPRINT</span><h3>관심 분야와 강도</h3></div></div>
            <ol className={styles.interestList}>
              {profile.interests.slice(0, 8).map((interest) => (
                <li key={interest.key}>
                  <div><strong>{interest.label}</strong><span>{interest.kind}</span></div>
                  <div className={styles.interestBar}><i style={{ width: `${Math.max(4, interest.score)}%` }} /></div>
                  <dl><div><dt>7D</dt><dd>{interest.activityCount7d}</dd></div><div><dt>직접</dt><dd>{interest.initiatedCount30d}</dd></div><div><dt>점수</dt><dd>{interest.score}</dd></div></dl>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.dossierSection}>
            <div className={styles.dossierSectionHeader}><div><Target size={16} /><span>WHAT TO WATCH</span><h3>다음 확인 포인트</h3></div></div>
            <ol className={styles.watchpointList}>
              {profile.watchpoints.map((point, index) => (
                <li key={point}><span>{String(index + 1).padStart(2, "0")}</span><p>{point}</p></li>
              ))}
            </ol>
            <div className={styles.signalDigest}>
              <span>RELATED SIGNALS</span>
              {signals.filter((signal) => signal.signalClass !== "noise").slice(0, 5).map((signal) => (
                <article key={signal.id}>
                  <b>{signal.score}</b><div><strong>{signal.title}</strong><small>{signal.signalClass.toUpperCase()} · {relativeTime(signal.occurredAt, generatedAt)}</small></div>
                  {signal.basescanUrls[0] ? <a href={signal.basescanUrls[0]} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a> : null}
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className={styles.dossierSection}>
          <div className={styles.dossierSectionHeader}>
            <div><Wallet size={16} /><span>ASSET BOOK</span><h3>자산별 유입·유출 흔적</h3></div>
            <small>수량은 30일 Transfer 합계, USD는 현재 메타데이터 기반 추정</small>
          </div>
          <div className={styles.assetTableWrap}>
            <table className={styles.assetTable}>
              <thead><tr><th>자산 / 섹터</th><th>수신</th><th>전송</th><th>순수량</th><th>7D 건수</th><th>직접 행동</th><th>추정 순 USD</th><th /></tr></thead>
              <tbody>
                {profile.assetFlows.map((asset) => (
                  <tr key={asset.address} className={asset.passiveDistribution ? styles.passiveAssetRow : undefined}>
                    <td><strong>{asset.symbol}</strong>{asset.passiveDistribution ? <em className={styles.passiveDistribution}>수동 배포</em> : null}<span>{asset.name} · {asset.sector}</span></td>
                    <td>{formatCompact(asset.receivedAmount)}</td>
                    <td>{formatCompact(asset.sentAmount)}</td>
                    <td className={asset.netAmount > 0 ? styles.netPositive : asset.netAmount < 0 ? styles.netNegative : ""}>{signed(asset.netAmount)}</td>
                    <td>{asset.transferCount7d}</td>
                    <td>{asset.initiatedActivityCount}</td>
                    <td>{formatUsd(asset.estimatedNetUsd)}</td>
                    <td><a href={`https://basescan.org/token/${asset.address}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className={styles.dossierColumns}>
          <section className={styles.dossierSection}>
            <div className={styles.dossierSectionHeader}><div><Network size={16} /><span>PROTOCOL MAP</span><h3>직접 호출한 프로토콜</h3></div></div>
            {profile.protocols.length ? (
              <ol className={styles.protocolList}>
                {profile.protocols.map((protocol) => (
                  <li key={protocol.address}>
                    <div><strong>{protocol.name}</strong>{protocol.isNew7d ? <em>NEW 7D</em> : null}<span>{protocol.sector}</span></div>
                    <p>{protocol.uniqueMethods.join(" · ") || "메서드 미확인"}</p>
                    <dl><div><dt>7D</dt><dd>{protocol.interactionCount7d}</dd></div><div><dt>30D</dt><dd>{protocol.interactionCount30d}</dd></div></dl>
                    <a href={`https://basescan.org/address/${protocol.address}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a>
                  </li>
                ))}
              </ol>
            ) : <div className={styles.empty}>단순 토큰 전송을 제외한 직접 프로토콜 호출이 없습니다.</div>}
          </section>

          <section className={styles.dossierSection}>
            <div className={styles.dossierSectionHeader}><div><Users size={16} /><span>COUNTERPARTY MAP</span><h3>주요 상대방</h3></div></div>
            <ol className={styles.counterpartyList}>
              {profile.counterparties.slice(0, 8).map((counterparty) => (
                <li key={counterparty.address}>
                  <span className={styles[`relationship_${counterparty.relationship}`]}>{counterparty.relationship}</span>
                  <div><strong>{counterparty.label}</strong><code>{shortAddress(counterparty.address, 8, 6)}</code></div>
                  <dl><div><dt>IN</dt><dd>{counterparty.inboundCount}</dd></div><div><dt>OUT</dt><dd>{counterparty.outboundCount}</dd></div><div><dt>7D</dt><dd>{counterparty.interactionCount7d}</dd></div></dl>
                  <a href={`https://basescan.org/address/${counterparty.address}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section className={styles.dossierSection}>
          <div className={styles.dossierSectionHeader}>
            <div><Clock size={16} /><span>TRANSACTION RESEARCH LOG</span><h3>중요 트랜잭션 흔적과 해석</h3></div>
            <small>중요도·직접성·신호 연관성 기준 상위 {profile.notableMoves.length}건</small>
          </div>
          <ol className={styles.moveList}>
            {profile.notableMoves.map((move) => (
              <li key={move.id}>
                <div className={`${styles.moveScore} ${priorityClass(move.importanceScore)}`}><strong>{move.importanceScore}</strong><span>IMPORTANCE</span></div>
                <time>{KST_FORMATTER.format(new Date(move.occurredAt))}</time>
                <div className={styles.moveBody}>
                  <div><span>{CATEGORY_LABELS[move.category]}</span><em>{move.confidence.toUpperCase()}</em>{move.estimatedUsd !== null && move.estimatedUsd !== undefined ? <b>{formatUsd(move.estimatedUsd)}</b> : null}</div>
                  <strong>{move.title}</strong>
                  <p>{move.description}</p>
                  <small><Target size={12} /> {move.whyItMatters}</small>
                </div>
                <a href={move.basescanUrl} target="_blank" rel="noreferrer" aria-label="BaseScan 트랜잭션 열기"><ArrowUpRight size={15} /></a>
              </li>
            ))}
          </ol>
          {profile.notableMoves.length === 0 ? <div className={styles.empty}>우선순위로 올릴 직접 행동 근거가 없습니다.</div> : null}
        </section>

        <section className={styles.dossierFootnote}>
          <AlertTriangle size={15} />
          <p>이 리포트는 최근 30일 공개 온체인 흔적의 규칙형 해석입니다. 주소 실소유자·불법성·매수 의도·향후 수익률을 확정하지 않으며, 가격 커버리지가 낮을수록 수량과 BaseScan 원문을 우선 확인해야 합니다. 현재 보조 원문 활동 {activities.length}건.</p>
        </section>
        </article>
      ) : (
        <article className={styles.dossierStatus} onMouseDown={(event) => event.stopPropagation()}>
          <header>
            <div>
              <p>{wallet.exchange.toUpperCase()} / QUID DEPOSIT RANK #{wallet.rank}</p>
              <h2 id="dossier-title">{shortAddress(wallet.address, 10, 8)} 지갑 리포트</h2>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="지갑 리포트 닫기"><X size={20} /></button>
          </header>
          <div>
            {error ? <AlertTriangle size={28} /> : <LoaderCircle className={styles.loadingSpinner} size={28} />}
            <strong>{error ? "리포트를 불러오지 못했습니다." : "30일 행동 장부를 불러오는 중입니다."}</strong>
            <p>{error ?? "자산 흐름·프로토콜·상대방·중요 트랜잭션을 준비하고 있습니다."}</p>
            {error ? <button type="button" onClick={onRetry}>다시 시도</button> : null}
          </div>
        </article>
      )}
    </dialog>
  );
}
