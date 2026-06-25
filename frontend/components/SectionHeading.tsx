export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1.5 h-5 rounded-full" style={{ background: "var(--accent)" }} />
      <h2 className="font-black text-lg" style={{ color: "var(--primary)" }}>{children}</h2>
    </div>
  );
}
