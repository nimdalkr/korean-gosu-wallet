import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

const SESSION_COOKIE = "kgw_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const ISSUER = "korean-gosu-wallet";
const AUDIENCE = "private-dashboard";
const CLOUDFLARE_ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

let cachedCloudflareJwksUrl: string | null = null;
let cachedCloudflareJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function cloudflareAccessConfig() {
  const teamDomain = process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.trim();
  const audience = process.env.CLOUDFLARE_ACCESS_AUDIENCE?.trim();
  const allowedIdentities = new Set(
    (process.env.ALLOWED_ACCESS_IDENTITIES ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!teamDomain || !audience) {
    throw new Error(
      "Cloudflare Access requires CLOUDFLARE_ACCESS_TEAM_DOMAIN and CLOUDFLARE_ACCESS_AUDIENCE.",
    );
  }
  if (allowedIdentities.size === 0) {
    throw new Error("ALLOWED_ACCESS_IDENTITIES must contain at least one identity.");
  }
  if (
    [...allowedIdentities].some(
      (identity) =>
        identity.length > 320 ||
        !identity.includes("@") ||
        /\s/.test(identity),
    )
  ) {
    throw new Error("ALLOWED_ACCESS_IDENTITIES contains an invalid email identity.");
  }

  let issuerUrl: URL;
  try {
    issuerUrl = new URL(teamDomain);
  } catch {
    throw new Error("CLOUDFLARE_ACCESS_TEAM_DOMAIN must be an absolute HTTPS URL.");
  }
  const hostname = issuerUrl.hostname.toLowerCase();
  if (
    issuerUrl.protocol !== "https:" ||
    issuerUrl.port ||
    issuerUrl.username ||
    issuerUrl.password ||
    (issuerUrl.pathname !== "/" && issuerUrl.pathname !== "") ||
    issuerUrl.search ||
    issuerUrl.hash ||
    !hostname.endsWith(".cloudflareaccess.com") ||
    hostname === "cloudflareaccess.com"
  ) {
    throw new Error(
      "CLOUDFLARE_ACCESS_TEAM_DOMAIN must be https://<team>.cloudflareaccess.com.",
    );
  }

  const issuer = issuerUrl.origin;
  return {
    issuer,
    audience,
    allowedIdentities,
    jwksUrl: new URL("/cdn-cgi/access/certs", `${issuer}/`),
  };
}

function cloudflareJwks(jwksUrl: URL) {
  const key = jwksUrl.href;
  if (!cachedCloudflareJwks || cachedCloudflareJwksUrl !== key) {
    cachedCloudflareJwksUrl = key;
    cachedCloudflareJwks = createRemoteJWKSet(jwksUrl, {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });
  }
  return cachedCloudflareJwks;
}

function sessionKey() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return new TextEncoder().encode(value);
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

export function passwordMatches(candidate: string) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected || expected.length < 16) return false;
  return timingSafeEqual(hash(candidate), hash(expected));
}

export async function requireUpstreamAccess() {
  if (process.env.REQUIRE_UPSTREAM_AUTH !== "true") return;

  const config = cloudflareAccessConfig();
  const assertion = (await headers()).get(CLOUDFLARE_ACCESS_JWT_HEADER)?.trim();
  if (!assertion || assertion.length > 16_384) {
    notFound();
  }

  let identity: string | null = null;
  try {
    const { payload } = await jwtVerify(assertion, cloudflareJwks(config.jwksUrl), {
      algorithms: ["RS256"],
      issuer: config.issuer,
      audience: config.audience,
      clockTolerance: 5,
    });
    identity = typeof payload.email === "string"
      ? payload.email.trim().toLowerCase()
      : null;
  } catch {
    notFound();
  }
  if (!identity || !config.allowedIdentities.has(identity)) notFound();
}

export async function createSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = await new SignJWT({ access: "dashboard" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(expiresAt)
    .sign(sessionKey());

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    priority: "high",
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function hasValidSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const payload = await jwtVerify(token, sessionKey(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload.payload.access === "dashboard";
  } catch {
    return false;
  }
}

export async function requireSession() {
  if (!(await hasValidSession())) redirect("/login");
}
