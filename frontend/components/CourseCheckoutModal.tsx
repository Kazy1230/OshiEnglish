"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { toast } from "@/components/Toast";

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

function PayForm({ courseId, onClose }: { courseId: number; onClose: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/purchase-complete?course_id=${courseId}` },
      });
      if (error) {
        toast(error.message || "決済に失敗しました。カード情報を確認してください", "error");
        setSubmitting(false);
        return;
      }
      router.push(`/purchase-complete?course_id=${courseId}`);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "決済に失敗しました", "error");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement />
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1">キャンセル</button>
        <button type="submit" disabled={!stripe || submitting} className="btn-primary flex-1 disabled:opacity-50">
          {submitting ? "処理中…" : "購入する"}
        </button>
      </div>
    </form>
  );
}

export function CourseCheckoutModal({ courseId, clientSecret, onClose }: { courseId: number; clientSecret: string; onClose: () => void }) {
  if (!stripePromise) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50 px-4">
        <div className="card max-w-md w-full">
          <p className="text-sm" style={{ color: "var(--muted)" }}>決済機能は現在準備中です。</p>
          <button onClick={onClose} className="btn-ghost mt-4 w-full">閉じる</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50 px-4">
      <div className="card max-w-md w-full">
        <h3 className="font-bold mb-3" style={{ color: "var(--primary)" }}>お支払い情報を入力</h3>
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <PayForm courseId={courseId} onClose={onClose} />
        </Elements>
      </div>
    </div>
  );
}
