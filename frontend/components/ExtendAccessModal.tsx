"use client";
import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { toast } from "@/components/Toast";

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

function ExtendPayForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: "if_required" });
      if (error) {
        toast(error.message || "決済に失敗しました。カード情報を確認してください", "error");
        setSubmitting(false);
        return;
      }
      if (paymentIntent?.status === "succeeded") {
        onSuccess();
      } else {
        toast("決済処理中です。しばらくしてから再度ご確認ください", "success");
        onSuccess();
      }
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
          {submitting ? "処理中…" : "400円で延長する"}
        </button>
      </div>
    </form>
  );
}

/** 自由進行型コースのチャット・AI利用期限（90日）を400円で90日延長するための小窓。 */
export function ExtendAccessModal({ clientSecret, onClose, onSuccess }: { clientSecret: string; onClose: () => void; onSuccess: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50 px-4" onClick={onClose}>
      <div className="card max-w-md w-full flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold" style={{ color: "var(--primary)" }}>チャット利用期間を延長</h3>
        <p className="text-xs" style={{ color: "var(--muted)" }}>400円のお支払いで、あと90日間チャット・AI相談が使えるようになります。</p>
        {!stripePromise ? (
          <>
            <p className="text-sm" style={{ color: "var(--muted)" }}>決済機能は現在準備中です。</p>
            <button onClick={onClose} className="btn-ghost">閉じる</button>
          </>
        ) : (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <ExtendPayForm onClose={onClose} onSuccess={onSuccess} />
          </Elements>
        )}
      </div>
    </div>
  );
}
