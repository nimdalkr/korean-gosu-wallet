import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  headers: vi.fn(),
  jwtVerify: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies, headers: mocks.headers }));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock("jose", async (importOriginal) => {
  const original = await importOriginal<typeof import("jose")>();
  return {
    ...original,
    createRemoteJWKSet: mocks.createRemoteJWKSet,
    jwtVerify: mocks.jwtVerify,
  };
});

import { requireUpstreamAccess } from "./session";

const ACCESS_ENV_KEYS = [
  "REQUIRE_UPSTREAM_AUTH",
  "CLOUDFLARE_ACCESS_TEAM_DOMAIN",
  "CLOUDFLARE_ACCESS_AUDIENCE",
  "ALLOWED_ACCESS_IDENTITIES",
] as const;

afterEach(() => {
  for (const key of ACCESS_ENV_KEYS) delete process.env[key];
  vi.clearAllMocks();
});

describe("requireUpstreamAccess", () => {
  it("keeps local development available when upstream auth is disabled", async () => {
    await expect(requireUpstreamAccess()).resolves.toBeUndefined();
    expect(mocks.headers).not.toHaveBeenCalled();
  });

  it("fails closed when the identity allowlist is empty", async () => {
    process.env.REQUIRE_UPSTREAM_AUTH = "true";
    process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN = "https://gosu.cloudflareaccess.com";
    process.env.CLOUDFLARE_ACCESS_AUDIENCE = "application-audience";

    await expect(requireUpstreamAccess()).rejects.toThrow(
      "ALLOWED_ACCESS_IDENTITIES must contain at least one identity.",
    );
  });

  it("verifies signature, issuer, audience, and the email allowlist", async () => {
    process.env.REQUIRE_UPSTREAM_AUTH = "true";
    process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN = "https://gosu.cloudflareaccess.com";
    process.env.CLOUDFLARE_ACCESS_AUDIENCE = "application-audience";
    process.env.ALLOWED_ACCESS_IDENTITIES = "allowed@example.com";
    mocks.headers.mockResolvedValue(
      new Headers({ "cf-access-jwt-assertion": "signed-access-token" }),
    );
    mocks.jwtVerify.mockResolvedValue({ payload: { email: "Allowed@Example.com" } });

    await expect(requireUpstreamAccess()).resolves.toBeUndefined();
    expect(mocks.createRemoteJWKSet).toHaveBeenCalledWith(
      new URL("https://gosu.cloudflareaccess.com/cdn-cgi/access/certs"),
      expect.objectContaining({ timeoutDuration: 5_000 }),
    );
    expect(mocks.jwtVerify).toHaveBeenCalledWith(
      "signed-access-token",
      expect.any(Function),
      expect.objectContaining({
        algorithms: ["RS256"],
        issuer: "https://gosu.cloudflareaccess.com",
        audience: "application-audience",
      }),
    );
  });

  it("rejects a valid token whose identity is not explicitly allowed", async () => {
    process.env.REQUIRE_UPSTREAM_AUTH = "true";
    process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN = "https://gosu.cloudflareaccess.com";
    process.env.CLOUDFLARE_ACCESS_AUDIENCE = "application-audience";
    process.env.ALLOWED_ACCESS_IDENTITIES = "allowed@example.com";
    mocks.headers.mockResolvedValue(
      new Headers({ "cf-access-jwt-assertion": "signed-access-token" }),
    );
    mocks.jwtVerify.mockResolvedValue({ payload: { email: "other@example.com" } });

    await expect(requireUpstreamAccess()).rejects.toThrow("NOT_FOUND");
  });
});
