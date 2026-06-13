"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { resolveTheme } from "@/lib/theme";

type CorrectionType = "writing" | "speaking";

export function CorrectionSubmissionModal({ theme: t, initialType, onClose, onSent }: {
  theme: ReturnType<typeof resolveTheme>;
  initialType?: CorrectionType;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [type, setType] = useState<CorrectionType>(initialType ?? "writing");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingKind, setRecordingKind] = useState<"audio" | "video" | null>(null);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [mediaKind, setMediaKind] = useState<"audio" | "video" | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  async function startRecording(kind: "audio" | "video") {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === "audio" ? { audio: true } : { audio: true, video: true }
      );
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        setMediaBlob(blob);
        setMediaKind(kind);
        setUploadFile(null);
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecordingKind(kind);
      setRecording(true);
    } catch {
      toast("マイク／カメラへのアクセスを許可してください", "error");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    setRecordingKind(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setUploadFile(file);
    if (file) {
      setMediaBlob(null);
      setMediaKind(null);
    }
  }

  function clearMedia() {
    setMediaBlob(null);
    setMediaKind(null);
    setUploadFile(null);
  }

  async function handleSubmit() {
    if (sending) return;
    setSending(true);
    try {
      if (type === "writing") {
        if (!text.trim()) {
          toast("添削してほしい英文を入力してください", "error");
          return;
        }
        await api.submitCorrectionText({ correction_type: "writing", text_content: text.trim(), note: note.trim() || undefined });
      } else if (uploadFile) {
        const hint: "audio" | "video" = uploadFile.type.startsWith("video") ? "video" : "audio";
        await api.submitCorrectionMedia({
          file: uploadFile,
          filename: uploadFile.name,
          correction_type: "speaking",
          media_type_hint: hint,
          note: (note || text).trim() || undefined,
        });
      } else if (mediaBlob && mediaKind) {
        const ext = mediaKind === "video" ? "webm" : "webm";
        await api.submitCorrectionMedia({
          file: mediaBlob,
          filename: `recording.${ext}`,
          correction_type: "speaking",
          media_type_hint: mediaKind,
          note: (note || text).trim() || undefined,
        });
      } else if (text.trim() || note.trim()) {
        await api.submitCorrectionText({ correction_type: "speaking", text_content: text.trim() || undefined, note: note.trim() || undefined });
      } else {
        toast("録音・ファイル・テキストのいずれかを入力してください", "error");
        return;
      }
      toast("添削を申し込みました！キャラクターからの連絡をお待ちください", "success");
      onSent?.();
      onClose();
    } catch (err: any) {
      toast(err.message || "送信に失敗しました", "error");
    } finally {
      setSending(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    background: t.bg, border: `1px solid ${t.border}`, color: t.text, fontFamily: t.fontFamily,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="rounded-2xl p-5 max-w-sm w-full shadow-xl max-h-[90vh] overflow-y-auto" style={{ background: t.card, border: `1px solid ${t.border}` }}>
        <p className="font-black mb-3" style={{ color: t.primary, fontFamily: t.fontFamily }}>
          📝 添削を申し込む
        </p>

        {!initialType && (
          <div className="flex gap-2 mb-3">
            <button type="button" onClick={() => setType("writing")}
              className="flex-1 text-sm px-3 py-2 rounded-xl font-bold transition-all"
              style={type === "writing" ? { background: t.accent, color: "white" } : { border: `1px solid ${t.border}`, color: t.text }}>
              ✍️ ライティング
            </button>
            <button type="button" onClick={() => setType("speaking")}
              className="flex-1 text-sm px-3 py-2 rounded-xl font-bold transition-all"
              style={type === "speaking" ? { background: t.accent, color: "white" } : { border: `1px solid ${t.border}`, color: t.text }}>
              🎤 スピーキング
            </button>
          </div>
        )}

        {type === "writing" ? (
          <>
            <label className="text-xs font-bold block mb-1" style={{ color: t.accent }}>添削してほしい英文</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="英文を入力してください"
              rows={8}
              className="w-full text-sm rounded-xl px-3 py-2 outline-none resize-none mb-2"
              style={inputStyle}
            />
          </>
        ) : (
          <>
            <label className="text-xs font-bold block mb-1" style={{ color: t.accent }}>音声・動画</label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {!recording ? (
                <>
                  <button type="button" onClick={() => startRecording("audio")}
                    className="text-xs px-3 py-1.5 rounded-full font-bold transition-all"
                    style={{ border: `1px solid ${t.border}`, color: t.accent }}>
                    🎙️ 録音開始
                  </button>
                  <button type="button" onClick={() => startRecording("video")}
                    className="text-xs px-3 py-1.5 rounded-full font-bold transition-all"
                    style={{ border: `1px solid ${t.border}`, color: t.accent }}>
                    📹 録画開始
                  </button>
                </>
              ) : (
                <button type="button" onClick={stopRecording}
                  className="text-xs px-3 py-1.5 rounded-full font-bold transition-all"
                  style={{ background: "#e74c3c", color: "white" }}>
                  ■ {recordingKind === "video" ? "録画" : "録音"}を停止
                </button>
              )}
            </div>

            {mediaBlob && mediaKind && (
              <div className="mb-2">
                {mediaKind === "video" ? (
                  <video controls src={URL.createObjectURL(mediaBlob)} className="w-full rounded-lg" />
                ) : (
                  <audio controls src={URL.createObjectURL(mediaBlob)} className="w-full" />
                )}
                <button type="button" onClick={clearMedia} className="text-xs mt-1" style={{ color: t.accent }}>取り消す</button>
              </div>
            )}

            {!mediaBlob && (
              <>
                <label className="text-xs font-bold block mb-1" style={{ color: t.accent }}>またはファイルを選択</label>
                <input type="file" accept="audio/*,video/*" onChange={handleFileChange}
                  className="w-full text-xs rounded-xl px-2 py-2 outline-none mb-2"
                  style={inputStyle} />
                {uploadFile && (
                  <p className="text-xs mb-2" style={{ color: t.accent }}>
                    選択中: {uploadFile.name} <button type="button" onClick={clearMedia} className="ml-1 underline">取り消す</button>
                  </p>
                )}
              </>
            )}

            <label className="text-xs font-bold block mb-1" style={{ color: t.accent }}>メモ（任意）</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="話した内容や、見てほしいポイントなど"
              rows={3}
              className="w-full text-sm rounded-xl px-3 py-2 outline-none resize-none mb-1"
              style={inputStyle}
            />
          </>
        )}

        {type === "writing" && (
          <>
            <label className="text-xs font-bold block mb-1" style={{ color: t.accent }}>メッセージ（任意）</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="伝えたいことがあれば添えてね"
              rows={2}
              className="w-full text-sm rounded-xl px-3 py-2 outline-none resize-none mb-1"
              style={inputStyle}
            />
          </>
        )}

        <p className="text-[11px] mb-3 mt-2" style={{ color: t.accent }}>
          ※ 添削は¥1,000です。提出後、キャラクターからのフィードバック記事が本棚に届きます。
        </p>

        <div className="flex justify-end gap-2 mt-2">
          <button type="button" onClick={onClose}
            className="text-sm px-4 py-2 rounded-xl font-bold transition-all"
            style={{ border: `1px solid ${t.border}`, color: t.text }}>
            キャンセル
          </button>
          <button type="button" onClick={handleSubmit} disabled={sending}
            className="text-sm px-4 py-2 rounded-xl font-bold text-white transition-all disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.accent})` }}>
            {sending ? "送信中..." : "申し込む"}
          </button>
        </div>
      </div>
    </div>
  );
}
