"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="system-state">
      <p>DATA PIPELINE / ERROR</p>
      <h1>대시보드 데이터를 읽지 못했습니다.</h1>
      <button type="button" onClick={reset}>
        다시 시도
      </button>
    </main>
  );
}
