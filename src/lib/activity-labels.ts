import type { ActivityCategory } from "./domain";

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  airdrop_received: "에어드롭 수신",
  token_buy_candidate: "토큰 매수 추정",
  token_sell_candidate: "토큰 매도 추정",
  nft_purchase_candidate: "NFT 매수 추정",
  nft_sale_candidate: "NFT 매도 추정",
  nft_mint: "NFT 민팅",
  token_receive: "토큰 수신",
  token_send: "토큰 전송",
  nft_receive: "NFT 수신",
  nft_send: "NFT 전송",
  bridge: "브리지",
  staking: "스테이킹",
  liquidity: "유동성",
  approval: "승인",
  contract_interaction: "컨트랙트 호출",
};
