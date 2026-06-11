import Link from "next/link";

export function Footer() {
  return (
    <footer className="py-6 text-center text-xs" style={{ color: "var(--muted)" }}>
      <Link href="/policy" className="hover:underline">返金・解約ポリシー</Link>
    </footer>
  );
}
