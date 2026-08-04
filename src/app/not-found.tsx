import Link from "next/link";

export default function NotFound() {
  return (
    <main className="system-state">
      <p>404 / PRIVATE ROUTE</p>
      <h1>요청한 화면이 없습니다.</h1>
      <Link href="/">대시보드로 이동</Link>
    </main>
  );
}
