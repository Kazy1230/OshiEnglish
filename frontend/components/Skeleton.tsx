export function Skeleton({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded-xl ${className}`}
      style={{ background: "linear-gradient(90deg, #e0ddd5 25%, #eeebe3 50%, #e0ddd5 75%)", backgroundSize: "200% 100%", ...style }}
    />
  );
}

export function AdminSkeleton() {
  return (
    <div className="admin-theme min-h-screen flex" style={{ background: "var(--bg)" }}>
      <div className="w-56 flex-shrink-0" style={{ background: "var(--ink)" }} />
      <div className="flex-1 p-8 flex flex-col gap-4">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    </div>
  );
}
