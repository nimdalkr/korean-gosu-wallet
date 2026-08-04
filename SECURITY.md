# Security policy

This repository and its deployment are intended for a very small, private audience.

- Never move `data/snapshot.json`, `data/wallets.seed.json`, or wallet exports into `public/`.
- Never commit `.env*`, API keys, passwords, session secrets, or provider credentials.
- Set `DASHBOARD_PASSWORD` to a long, unique passphrase and `SESSION_SECRET` to at least 32 random characters.
- Put every internet-reachable deployment behind Cloudflare Access or an equivalent authenticated private network. For Cloudflare Access, set `REQUIRE_UPSTREAM_AUTH=true`, the exact team-domain issuer, the application AUD tag, and a non-empty `ALLOWED_ACCESS_IDENTITIES` list. The application verifies the `Cf-Access-Jwt-Assertion` signature with Cloudflare's rotating JWKS before trusting the email claim.
- Keep the origin unreachable except through Cloudflare Tunnel or another locked-down proxy path. Set `LOGIN_TRUST_PROXY_HEADERS=true` only after that boundary is enforced; forwarded IP headers are attacker-controlled on a directly reachable origin.
- The built-in shared passphrase and bounded in-process throttle are defense in depth, not an organization-grade identity or distributed rate-limiting system. Apply login rate limits at Cloudflare Access as well when running multiple instances.
- A private GitHub repository does not make a separately hosted site private. Do not use a public static-hosting configuration for this dataset.
- Keep the `tracker-state` release and Actions artifacts private. They contain the full rolling activity checkpoint, while the Git repository contains the reduced dashboard snapshot.
- Rotate the dashboard password and session secret immediately if either may have been exposed. Rotating `SESSION_SECRET` invalidates all current sessions.

To report a vulnerability, contact the repository owner privately. Do not open a public issue containing wallet data, credentials, or exploit details.
