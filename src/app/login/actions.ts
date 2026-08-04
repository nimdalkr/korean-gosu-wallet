"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, passwordMatches, requireUpstreamAccess } from "@/lib/session";
import {
  clearLoginFailures,
  loginAttemptKey,
  loginThrottleStatus,
  recordLoginFailure,
} from "@/lib/login-throttle";

const loginSchema = z.object({
  password: z.string().min(1).max(512),
});

export async function login(formData: FormData) {
  await requireUpstreamAccess();
  const attemptKey = await loginAttemptKey();
  const throttle = loginThrottleStatus(attemptKey);
  if (throttle.blocked) {
    console.warn("Dashboard login blocked by throttling.");
    redirect("/login?error=locked");
  }
  const parsed = loginSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success || !passwordMatches(parsed.data.password)) {
    const failure = recordLoginFailure(attemptKey);
    console.warn("Dashboard login rejected.", { blocked: failure.blocked });
    await new Promise((resolve) => setTimeout(resolve, 350));
    redirect(failure.blocked ? "/login?error=locked" : "/login?error=invalid");
  }
  clearLoginFailures(attemptKey);
  await createSession();
  redirect("/");
}
