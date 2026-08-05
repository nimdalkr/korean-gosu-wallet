import type {
  WalletResearchDesk,
  WalletResearchDeskSummary,
  WalletResearchProfileSummary,
} from "./domain";

function summarizeProfile(
  profile: WalletResearchDesk["walletProfiles"][number],
): WalletResearchProfileSummary {
  return {
    address: profile.address,
    persona: profile.persona,
    personaLabel: profile.personaLabel,
    secondaryTags: profile.secondaryTags,
    headline: profile.headline,
    recentChange: profile.recentChange,
    momentum: profile.momentum,
    stance: profile.stance,
    researchPriority: profile.researchPriority,
    agencyScore: profile.agencyScore,
    sophisticationScore: profile.sophisticationScore,
    evidenceConfidence: profile.evidenceConfidence,
    meaningfulActions7d: profile.meaningfulActions7d,
    primarySector: profile.primarySector,
    interests: profile.interests.slice(0, 6),
    latestActivityAt: profile.latestActivityAt,
  };
}

export function summarizeResearchDesk(
  research: WalletResearchDesk,
): WalletResearchDeskSummary {
  return {
    methodologyVersion: research.methodologyVersion,
    brief: research.brief,
    walletProfiles: research.walletProfiles.map(summarizeProfile),
    themes: research.themes,
    strategyClusters: research.strategyClusters,
    metrics: research.metrics,
  };
}
