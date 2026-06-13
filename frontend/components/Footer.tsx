import Link from "next/link";

export function Footer() {
  return (
    <footer className="py-6 text-center text-xs flex items-center justify-center gap-4" style={{ color: "var(--muted)" }}>
      <Link href="/policy" className="hover:underline">返金・解約ポリシー</Link>
      <Link href="/shelf?withdraw=1" className="hover:underline">退会する</Link>
    </footer>
  );
}
