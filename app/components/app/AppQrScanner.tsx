"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import jsQR from "jsqr";
import { confirmQrLoginScan, parseQrLinkToken } from "@/lib/client/qrLogin";

type AppQrScannerProps = {
  isDark: boolean;
  onBack: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
  fullscreen?: boolean;
};

const VIEWFINDER_SIZE = "min(72vw, 280px)";

export default function AppQrScanner({
  isDark,
  onBack,
  onSuccess,
  onError,
  fullscreen = false,
}: AppQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [cameraPhase, setCameraPhase] = useState<"pending" | "ready" | "error">("pending");
  const [cameraError, setCameraError] = useState("");
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanError, setScanError] = useState("");

  useEffect(() => setMounted(true), []);

  const handleToken = useCallback(
    async (raw: string) => {
      if (busyRef.current) return;
      const token = parseQrLinkToken(raw);
      if (!token) return;
      busyRef.current = true;
      setBusy(true);
      const r = await confirmQrLoginScan(token);
      setBusy(false);
      busyRef.current = false;
      if (!r.ok) {
        setScanError(r.error);
        onError(r.error);
        return;
      }
      setScanError("");
      onSuccess();
    },
    [onError, onSuccess]
  );

  useEffect(() => {
    let cancelled = false;
    let raf = 0;

    const decodeWithJsQr = (video: HTMLVideoElement): string | null => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return null;
      if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      return jsQR(imageData.data, w, h)?.data ?? null;
    };

    const start = async () => {
      setCameraPhase("pending");
      setCameraError("");

      if (!("mediaDevices" in navigator) || !navigator.mediaDevices.getUserMedia) {
        setCameraError("Камера недоступна в этом окружении");
        setCameraPhase("error");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute("playsinline", "true");
          await video.play();
          if (!cancelled) setCameraPhase("ready");
        }

        type BarcodeDetectorCtor = new (opts: { formats: string[] }) => {
          detect: (src: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
        };
        const BarcodeDetector = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
        const detector = BarcodeDetector ? new BarcodeDetector({ formats: ["qr_code"] }) : null;

        const tick = async () => {
          if (cancelled) return;
          if (busyRef.current) {
            raf = window.requestAnimationFrame(tick);
            return;
          }
          const el = videoRef.current;
          if (el && el.readyState >= 2) {
            try {
              let raw: string | null = null;
              if (detector) {
                const codes = await detector.detect(el);
                raw = codes[0]?.rawValue ?? null;
              } else {
                raw = decodeWithJsQr(el);
              }
              if (raw) {
                void handleToken(raw);
                return;
              }
            } catch {
              /* ignore frame errors */
            }
          }
          raf = window.requestAnimationFrame(tick);
        };
        raf = window.requestAnimationFrame(tick);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/denied|permission|not allowed/i.test(msg)) {
            setCameraError("Нет доступа к камере. Разрешите камеру в настройках приложения или вставьте ссылку вручную.");
          } else {
            setCameraError("Не удалось открыть камеру. Вставьте ссылку из QR вручную.");
          }
          setCameraPhase("error");
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [handleToken]);

  const muted = isDark ? "text-zinc-400" : "text-gray-500";
  const textPrimary = isDark ? "text-zinc-100" : "text-gray-900";
  const shell = isDark ? "bg-zinc-900" : "bg-gray-100";

  const fullscreenBody = (
    <div className="fixed inset-0 z-[300] bg-black text-white">
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          cameraPhase === "ready" ? "opacity-100" : "opacity-0"
        }`}
        playsInline
        muted
        autoPlay
      />

      <div className="relative z-10 flex min-h-dvh flex-col">
        <div className="safe-top safe-px shrink-0 px-4 pt-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white"
          >
            <ChevronLeftIcon />
            Назад
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-8">
          {cameraPhase === "ready" ? (
            <>
              <QrViewfinderOverlay />
              <p className="mt-6 max-w-xs text-center text-sm text-white/75">
                Наведите рамку на QR-код на экране компьютера
              </p>
              {scanError ? (
                <p className="mt-3 max-w-xs text-center text-sm text-rose-400">{scanError}</p>
              ) : null}
            </>
          ) : null}

          {cameraPhase === "error" ? (
            <div className="w-full max-w-sm space-y-4 text-center">
              <h1 className="text-xl font-bold text-white">Сканировать QR</h1>
              <p className="text-sm text-white/70">{cameraError}</p>
              <ManualQrInput
                manual={manual}
                setManual={setManual}
                busy={busy}
                onSubmit={() => void handleToken(manual.trim())}
                dark
              />
            </div>
          ) : null}

          {busy ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 text-sm font-medium text-white">
              Подтверждаем…
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const compactBody = (
    <div className="flex flex-1 flex-col">
      <button
        type="button"
        onClick={onBack}
        className={`mb-4 inline-flex items-center gap-1.5 text-sm ${muted} hover:opacity-80`}
      >
        <ChevronLeftIcon />
        Назад
      </button>

      <h1 className={`mb-1 text-xl font-bold ${textPrimary}`}>Сканировать QR</h1>
      <p className={`mb-4 text-sm ${muted}`}>Наведите камеру на QR-код на экране компьютера</p>

      <div className={`relative mb-4 aspect-square w-full overflow-hidden ${shell}`}>
        <video
          ref={videoRef}
          className={`h-full w-full object-cover ${cameraPhase === "ready" ? "opacity-100" : "opacity-0"}`}
          playsInline
          muted
          autoPlay
        />
        {cameraPhase === "ready" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <QrViewfinderOverlay compact />
          </div>
        ) : null}
        {cameraPhase === "pending" ? <div className="absolute inset-0 bg-black" aria-hidden /> : null}
        {cameraPhase === "error" ? (
          <div className={`absolute inset-0 flex items-center justify-center bg-black p-4 text-center text-sm ${muted}`}>
            {cameraError}
          </div>
        ) : null}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-medium text-white">
            Подтверждаем…
          </div>
        ) : null}
      </div>

      {cameraPhase === "error" ? (
        <ManualQrInput
          manual={manual}
          setManual={setManual}
          busy={busy}
          onSubmit={() => void handleToken(manual.trim())}
          dark={isDark}
        />
      ) : null}
    </div>
  );

  if (fullscreen && mounted) {
    return createPortal(fullscreenBody, document.body);
  }

  return compactBody;
}

function QrViewfinderOverlay({ compact = false }: { compact?: boolean }) {
  const size = compact ? "100%" : VIEWFINDER_SIZE;
  const corner = compact ? "h-6 w-6" : "h-8 w-8";
  const border = compact ? "border-[2px]" : "border-[3px]";

  return (
    <div
      className="relative aspect-square"
      style={{
        width: size,
        height: size,
        boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
      }}
      aria-hidden
    >
      <span className={`absolute left-0 top-0 ${corner} ${border} border-l-white border-t-white rounded-tl-lg`} />
      <span className={`absolute right-0 top-0 ${corner} ${border} border-r-white border-t-white rounded-tr-lg`} />
      <span className={`absolute bottom-0 left-0 ${corner} ${border} border-b-white border-l-white rounded-bl-lg`} />
      <span className={`absolute bottom-0 right-0 ${corner} ${border} border-b-white border-r-white rounded-br-lg`} />
    </div>
  );
}

function ManualQrInput({
  manual,
  setManual,
  busy,
  onSubmit,
  dark,
}: {
  manual: string;
  setManual: (v: string) => void;
  busy: boolean;
  onSubmit: () => void;
  dark: boolean;
}) {
  return (
    <div className="space-y-2">
      <input
        type="text"
        value={manual}
        onChange={(e) => setManual(e.target.value)}
        placeholder="Ссылка или код из QR"
        className={`w-full rounded-xl border-0 px-4 py-3 text-sm outline-none ${
          dark ? "bg-zinc-800 text-zinc-100 placeholder:text-zinc-500" : "bg-[#f0f0f0] text-gray-900 placeholder:text-gray-400"
        }`}
      />
      <button
        type="button"
        disabled={!manual.trim() || busy}
        onClick={onSubmit}
        className="w-full rounded-xl bg-[#3390ec] py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        Подтвердить вручную
      </button>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}
