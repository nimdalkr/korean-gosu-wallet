# Korean Gosu Wallet

업비트·빗썸의 Base 메인넷 QUID 입금 주소군을 추적하는 비공개 온체인 알파 레이더입니다. 주소별 토큰·NFT·컨트랙트 활동을 주기적으로 수집하고, 다지갑 동시 행동·순유입·신규 컨트랙트 접근·이례적 유출을 점수화해 원문 노이즈보다 먼저 보여줍니다.

## 현재 코호트

| 구분 | 업비트 | 빗썸 | 합계 |
| --- | ---: | ---: | ---: |
| QUID 입금 발신 주소 | 267 | 141 | 408 |
| 거래소 내부 주소 제외 추적 대상 | 267 | 139 | 406 |
| 거래소별 입금량 Top 100 | 100 | 100 | 200 |

- 업비트와 빗썸 사이의 동일 발신 주소는 0개입니다.
- 빗썸 141개 중 2개는 제공된 빗썸 핫월렛에서 출발한 내부 이동이므로 외부 추적 대상에서 제외했습니다.
- 주소 개수는 지갑 주소의 개수이며 실사용자나 실소유자의 수를 뜻하지 않습니다.
- 기준 토큰은 Base의 Squid (`QUID`) `0x1a44233fae8d50f1aeb3a5d58dd426ff4814cb53`입니다.
- 최초 입금 코호트는 Base safe block `49,531,614`, 2026-08-04 23:09:35 KST에서 동결했습니다.

재현 가능한 입력은 `data/deposit-source.json`, 추적 씨드는 `data/wallets.seed.json`에 있습니다. `npm run seed:import`를 실행하면 알려진 5개 거래소 핫월렛을 먼저 제외한 뒤 거래소별 QUID 원시 수량 합계로 다시 순위를 계산합니다.

바로 사용할 수 있는 주소 목록은 다음 CSV로 함께 제공합니다.

- `data/deposit-senders-all.csv`: 거래소 내부 이동을 포함한 408개 입금 발신 주소
- `data/wallets-external.csv`: 실제 추적 대상 406개 주소
- `data/upbit-top100.csv`, `data/bithumb-top100.csv`: 거래소별 입금량 상위 100개 주소
- `data/hotwallet-top100.csv`: 제공된 5개 핫월렛 각각의 입금량 상위 주소, 핫월렛 간 중복 허용

`npm run export:wallets`로 다섯 파일을 결정론적으로 다시 생성할 수 있습니다.

## 대시보드가 보여주는 것

- 24시간 70점 이상 유의미 신호, 7일 집중 관찰 자산, 고위험 이상 행동
- 여러 지갑의 동일 토큰·NFT 매수/민팅, 순유입 유지, 동일 컨트랙트 호출
- 평소 대비 행동 급증, 다지갑 동시 유출과 알려진 거래소 핫월렛 목적지
- 동일 발신자·동일 수량의 수동 대량 살포와 스팸성 토큰을 별도 노이즈로 격리
- 각 신호의 0~100점, 가점·감점 이유, 참여 지갑, 거래소 교차 여부, BaseScan 근거
- 406개 외부 지갑과 거래소별 입금 순위·QUID 입금량
- 24시간·7일·30일 활동량과 마지막 활동 시각
- ERC-20, ERC-721, ERC-1155 수신·전송
- NFT 민팅, NFT 매수·매도 추정, 특정 컬렉션 활동
- 토큰 매수·매도 추정, 에어드롭, 브리지, 스테이킹, 유동성, 승인, 컨트랙트 호출
- 활동별 판정 신뢰도, 근거, BaseScan 원문 링크
- 거래소·기간·신호 분류·최소 점수·Top 100·주소/자산/컨트랙트 검색 필터

“매수”는 단순 토큰 유입으로 판정하지 않습니다. 같은 트랜잭션에서 USDC·WETH·ETH 등 결제자산 유출과 비결제 토큰 또는 NFT 유입이 함께 확인될 때만 “매수 추정”으로 표시합니다. 최초 스냅샷에서는 이 조건을 만족하는 매수 추정이 0건이며, 이를 그대로 보여줍니다.

신호 점수는 가격 상승 확률이 아니라 조사 우선순위입니다. 점수 구성, 노이즈 방어와 각 신호의 정확한 의미는 [`docs/signal-model.md`](docs/signal-model.md)에 정리했습니다.

## 실행

Node.js 22 이상을 권장합니다.

```bash
npm ci
cp .env.example .env.local
```

`.env.local`에 다음 두 값을 반드시 설정합니다.

```dotenv
DASHBOARD_PASSWORD=길고-고유한-패스프레이즈
SESSION_SECRET=최소-32자-이상의-무작위-문자열
```

개발 서버와 검증 명령:

```bash
npm run dev
npm run check
```

최초 30일 이력 수집, 일반 증분 수집, 전체 일반 트랜잭션 재대조:

```bash
npm run collect:bootstrap
npm run collect
npm run collect:reconcile
```

Blockscout PRO를 쓰려면 `BLOCKSCOUT_API_BASE=https://api.blockscout.com/8453/api/v2`와 `BLOCKSCOUT_API_KEY`를 설정합니다. 키가 없으면 Base의 공개 Blockscout API를 사용하므로 속도와 가용성을 보장할 수 없습니다.

## 자동 수집

`.github/workflows/refresh-wallet-data.yml`은 다음 정책으로 동작합니다.

- 4시간 전수 수집 사이에는 매시간 거래소별 Top 100, 총 200개 지갑을 빠르게 증분 조회합니다.
- UTC 00·04·08·12·16·20시에는 406개 전체 지갑을 증분 조회합니다.
- 증분 구간에 자산 이동이 포착된 지갑만 일반 트랜잭션을 추가 조회합니다.
- 매일 18:41 UTC, 한국시간 03:41에 406개 주소의 일반 트랜잭션을 재대조합니다.
- 10분 겹침 구간과 이벤트 ID 중복 제거로 지연 인덱싱과 중복 실행을 흡수합니다.
- 원시 추적 상태와 같은 세대의 스냅샷을 checksum manifest와 함께 비공개 Release의 버전별 압축 asset으로 보관합니다. 최신 3세대를 남겨 교체 실패나 손상 시 직전 정상본으로 복구하고, 검증된 축약 스냅샷만 Git 이력에 커밋합니다.
- 린트, 타입 검사, 분류기 테스트, 데이터 무결성 검사, 프로덕션 빌드가 모두 통과해야 스냅샷을 갱신합니다.
- 수집·검증 job은 저장소 읽기 권한만 사용하고, 검증된 산출물을 받는 별도 게시 job에만 쓰기 권한을 줍니다.
- `DEPLOY_HOOK_URL` secret이 있으면 스냅샷 커밋 뒤 비공개 배포를 다시 빌드합니다. Docker 이미지는 JSON을 포함하므로 이 hook 또는 동등한 재배포가 필요합니다.
- `ALERT_WEBHOOK_URL` secret이 있으면 70점 이상 새 Alpha·Anomaly를 일반 JSON 또는 Discord webhook으로 전송합니다. 같은 High 신호는 한 번만 보내고 Critical 격상 시 다시 알립니다.

GitHub 저장소의 Actions secrets에 `BLOCKSCOUT_API_KEY`를 추가하는 구성을 권장합니다. Blockscout 무료 PRO 티어는 호출 수가 아닌 credits 기준이므로, 406개 주소의 일반 트랜잭션까지 짧은 간격으로 전수 조회하지 않도록 수집을 분리했습니다. 15분 이하 지연이 필요하면 managed Base RPC의 `eth_getLogs` 또는 전용 인덱서를 연결하는 것이 적합합니다.

선택적 알림 설정:

```dotenv
ALERT_WEBHOOK_URL=https://your-private-webhook.example/path
ALERT_WEBHOOK_FORMAT=generic # or discord
ALERT_MIN_SCORE=70
ALERT_LOOKBACK_HOURS=6
ALERT_MAX_SIGNALS=10
DASHBOARD_URL=https://your-private-dashboard.example
```

GitHub Actions에서는 URL을 repository secret으로, 나머지 값은 Actions variable로 설정합니다. webhook 페이로드에는 지갑 주소와 트랜잭션 근거가 포함되므로 신뢰하는 비공개 수신처만 사용하세요.

## 비공개 배포

앱은 서버 렌더링과 HttpOnly 세션 쿠키를 사용하며, 민감한 JSON은 `public/` 아래에 두지 않습니다. Docker 실행도 지원합니다.

```bash
docker build -t korean-gosu-wallet .
docker run --rm -p 3000:3000 \
  -e DASHBOARD_PASSWORD='your-long-passphrase' \
  -e SESSION_SECRET='your-random-secret-at-least-32-chars' \
  korean-gosu-wallet
```

위 명령은 로컬 또는 접근이 제한된 사설망 실행용입니다. 인터넷에서 접근 가능한 배포는 Cloudflare Access 애플리케이션과 allowlist를 먼저 구성한 뒤 다음 값을 추가해야 합니다.

```dotenv
REQUIRE_UPSTREAM_AUTH=true
CLOUDFLARE_ACCESS_TEAM_DOMAIN=https://your-team.cloudflareaccess.com
CLOUDFLARE_ACCESS_AUDIENCE=your-application-aud-tag
ALLOWED_ACCESS_IDENTITIES=first@example.com,second@example.com
LOGIN_TRUST_PROXY_HEADERS=true
```

앱은 `Cf-Access-Jwt-Assertion`을 team-domain issuer, application audience, Cloudflare의 원격 JWKS로 검증하고, 검증된 email claim이 비어 있지 않은 allowlist에 있을 때만 접근을 허용합니다. `LOGIN_TRUST_PROXY_HEADERS=true`는 Cloudflare Tunnel 또는 방화벽으로 원본 서버의 직접 접근을 막은 경우에만 사용하세요. 자세한 JWT 값은 [Cloudflare Access JWT 검증 문서](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)를 참고하세요.

비공개 GitHub 저장소 자체는 배포된 URL의 접근 제어가 아닙니다. GitHub Pages 같은 공개 정적 배포를 사용하지 마세요. 내장 패스프레이즈와 프로세스 내부 throttle은 추가 방어선이며, 다중 인스턴스 배포에서는 Cloudflare 쪽 로그인 제한도 함께 설정해야 합니다. 자세한 운영 원칙은 `SECURITY.md`에 있습니다.

## 데이터와 해석의 한계

- 주소 하나가 사람 하나라는 보장은 없고, 한 사람이 여러 주소를 쓸 수 있습니다.
- 단순 수신은 매수로 간주하지 않으며 “추정” 분류에는 항상 근거를 표시합니다.
- 무상 에어드롭과 스팸 NFT가 포함될 수 있으므로 단순 수신을 관심·보유 의도로 해석하면 안 됩니다.
- 대시보드는 최근 원문 활동 750개를 인터랙티브 탐색용으로 싣고, 지갑·기간·자산 집계는 전체 30일 상태를 기준으로 계산합니다.
- 공개 Blockscout 인덱스는 지연되거나 요청 제한이 생길 수 있으며, 수집 경고가 있으면 화면 상단에 표시됩니다.

## 근거 자료

- [Base 네트워크 정보와 공개 RPC 안내](https://docs.base.org/base-chain/reference/json-rpc-api)
- [Blockscout API v2 문서](https://docs.blockscout.com/devs/apis/rest)
- [Blockscout PRO API Base URL 안내](https://www.blog.blockscout.com/blockscout-pro-api-postman/)
- [GitHub Actions scheduled workflows](https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#schedule)
