export function Skeleton({ className = "", style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded-xl ${className}`}
      style={{ background: "linear-gradient(90deg, #e0ddd5 25%, #eeebe3 50%, #e0ddd5 75%)", backgroundSize: "200% 100%", ...style }}
    />
  );
}

export function ShelfSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: "#f8f7f2" }}>
      {/* ヘッダー */}
      <div className="h-12 mb-0" style={{ background: "#2e4057" }} />
      <div className="h-1" style={{ background: "#048a81" }} />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-36 mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden" style={{ minHeight: 200, background: "#fff", border: "1px solid #e0ddd5" }}>
              <Skeleton className="h-3 w-full rounded-none" style={{ background: `hsl(${i * 40},50%,75%)` }} />
              <div className="p-4 flex flex-col gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ArticleSkeleton() {
  return (
    <div className="min-h-screen" style={{ background: "#f8f7f2" }}>
      <div className="h-12" style={{ background: "#2e4057" }} />
      <div className="h-1" style={{ background: "#048a81" }} />
      <div className="max-w-4xl mx-auto px-4 py-10 flex gap-6">
        <div className="hidden lg:block w-12" />
        <div className="flex-1 flex flex-col gap-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="hidden lg:block w-36" />
      </div>
    </div>
  );
}

export function AdminSkeleton() {
  return (
    <div className="min-h-screen flex" style={{ background: "#f8f7f2" }}>
      <div className="w-56 flex-shrink-0" style={{ background: "#2e4057" }} />
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
