import { LockKeyhole, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { hasValidSession, requireUpstreamAccess } from "@/lib/session";
import { login } from "./actions";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  await requireUpstreamAccess();
  if (await hasValidSession()) redirect("/");
  const error = (await searchParams).error;

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="login-title">
        <div className={styles.eyebrow}>
          <ShieldCheck size={15} aria-hidden="true" />
          PRIVATE / BASE MAINNET
        </div>
        <div className={styles.brandMark} aria-hidden="true">
          KGW
        </div>
        <h1 id="login-title">Korean Gosu Wallet</h1>
        <p className={styles.description}>
          QUID 거래소 입금 지갑군의 온체인 움직임을 추적하는 제한 접근 대시보드입니다.
        </p>
        <form action={login} className={styles.form}>
          <label htmlFor="password">ACCESS PASSPHRASE</label>
          <div className={styles.inputWrap}>
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={1}
              maxLength={512}
              required
              autoFocus
            />
          </div>
          {error === "invalid" ? (
            <p className={styles.error} role="alert">
              패스프레이즈가 일치하지 않습니다.
            </p>
          ) : null}
          {error === "locked" ? (
            <p className={styles.error} role="alert">
              로그인 시도가 잠겼습니다. 15분 뒤 다시 시도하세요.
            </p>
          ) : null}
          <button type="submit">대시보드 열기</button>
        </form>
        <p className={styles.note}>
          세션은 HttpOnly 쿠키로 12시간 유지되며, 데이터 파일은 공개 경로에 노출되지 않습니다.
        </p>
      </section>
    </main>
  );
}
