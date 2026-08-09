"use client";

import { useEffect, useRef, useState } from "react";

/* Read-aloud, with a waveform that moves to the actual audio.

   Two voices, in order of preference:

   1. Gemini, via /api/tts — a real voice, metered like every other AI call.
   2. The browser's SpeechSynthesis — always available, no key, no cost,
      and nothing leaves the device.

   The fallback is not a formality. Speech is an enhancement; if the network
   is down or the provider is having a bad day, the student should still be
   able to hear their summary rather than see a broken button.

   The visualiser is driven by an AnalyserNode reading the audio that is
   actually playing, so the motion corresponds to the speech rather than
   being a loop that happens to run at the same time. Browser-voice playback
   has no audio graph to tap, so it animates a gentler synthetic wave — and
   the component says which voice you're hearing rather than pretending
   they're the same thing.
   ———————————————————————————————————————— */

type Mode = "idle" | "loading" | "speaking";
type Source = "gemini" | "browser" | null;

const BARS = 48;

export default function ReadAloud({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [source, setSource] = useState<Source>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  /* ————————————— Drawing ————————————— */

  function draw(getLevels: () => number[]) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    // Match the backing store to the device pixel ratio, or the line is
    // soft on every retina screen.
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, width, height);

    const levels = getLevels();
    const mid = height / 2;
    const gap = 2;
    const barWidth = Math.max(1.5, width / BARS - gap);
    const ink = getComputedStyle(canvas).color || "#1a1a1a";

    ctx2d.fillStyle = ink;
    for (let i = 0; i < BARS; i++) {
      const level = levels[i] ?? 0;
      // Taper toward the edges so it reads as one shape rather than a row
      // of separate bars.
      const taper = Math.sin((i / (BARS - 1)) * Math.PI) ** 0.65;
      const h = Math.max(1.5, level * (height - 4) * taper);
      const x = i * (barWidth + gap);
      const r = Math.min(barWidth / 2, h / 2);
      ctx2d.beginPath();
      ctx2d.roundRect(x, mid - h / 2, barWidth, h, r);
      ctx2d.fill();
    }
  }

  /** Levels from the real audio graph. */
  function analyserLevels(): number[] {
    const analyser = analyserRef.current;
    if (!analyser) return new Array(BARS).fill(0);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);

    // Speech energy sits low in the spectrum; sampling the whole range
    // leaves most bars dead. Take the bottom ~40% and spread it.
    const usable = Math.floor(bins.length * 0.4);
    const per = Math.max(1, Math.floor(usable / BARS));
    const out: number[] = [];
    for (let i = 0; i < BARS; i++) {
      let sum = 0;
      for (let j = 0; j < per; j++) sum += bins[i * per + j] ?? 0;
      out.push(Math.min(1, sum / per / 200));
    }
    return out;
  }

  /** A calm synthetic wave, for the browser voice where there's no graph to read. */
  function syntheticLevels(t: number): number[] {
    return Array.from({ length: BARS }, (_, i) => {
      const phase = t / 260 + i / 5;
      return 0.18 + 0.16 * (Math.sin(phase) + Math.sin(phase * 0.6)) ** 2;
    });
  }

  function startLoop(kind: "analyser" | "synthetic") {
    const started = performance.now();
    const tick = () => {
      draw(() =>
        kind === "analyser" ? analyserLevels() : syntheticLevels(performance.now() - started),
      );
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }

  function stopEverything() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    analyserRef.current = null;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    draw(() => new Array(BARS).fill(0));
    setMode("idle");
    setSource(null);
  }

  // Never leave a voice running after the component goes away.
  useEffect(() => stopEverything, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ————————————— Playback ————————————— */

  async function playGemini(): Promise<boolean> {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return false;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;

    const audio = new Audio(url);
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    // The audio graph is what makes the waveform real rather than decorative.
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtor) {
      const ctx = new AudioCtor();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.78;
      ctx.createMediaElementSource(audio).connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      // Browsers start contexts suspended until a gesture; this call is
      // inside a click handler, so resuming here is allowed.
      await ctx.resume().catch(() => {});
    }

    audio.onended = stopEverything;
    audio.onerror = stopEverything;

    await audio.play();
    setSource("gemini");
    setMode("speaking");
    startLoop(analyserRef.current ? "analyser" : "synthetic");
    return true;
  }

  function playBrowser(): boolean {
    if (!("speechSynthesis" in window)) return false;
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const preferred =
      voices.find((v) => ["Samantha", "Ava", "Google US English"].includes(v.name)) ??
      voices.find((v) => v.lang?.startsWith("en") && v.localService) ??
      voices.find((v) => v.lang?.startsWith("en"));
    if (preferred) utterance.voice = preferred;
    utterance.rate = 0.98;
    utterance.onend = stopEverything;
    utterance.onerror = stopEverything;

    synth.speak(utterance);
    setSource("browser");
    setMode("speaking");
    startLoop("synthetic");
    return true;
  }

  async function toggle() {
    if (mode === "speaking" || mode === "loading") {
      stopEverything();
      return;
    }

    setError(null);
    setMode("loading");
    try {
      if (await playGemini()) return;
    } catch (err) {
      console.error("[read-aloud] hosted voice failed:", err);
    }

    // Hosted voice unavailable — the device still has one.
    try {
      if (playBrowser()) return;
      setError("This browser can't read text aloud.");
      setMode("idle");
    } catch (err) {
      console.error("[read-aloud] browser voice failed:", err);
      setError("Couldn't start playback.");
      setMode("idle");
    }
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={mode === "speaking" ? "Stop reading aloud" : "Read this aloud"}
          className="inline-flex items-center gap-2 text-[0.85rem] text-gray-mid hover:text-ink transition-quiet disabled:opacity-60"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {mode === "speaking" ? (
              <>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </>
            ) : (
              <>
                <path d="M11 5 L6 9 H3 v6 h3 l5 4 Z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M18.5 5.5a9 9 0 0 1 0 13" />
              </>
            )}
          </svg>
          {mode === "loading" ? "Warming up…" : mode === "speaking" ? "Stop" : "Read aloud"}
        </button>

        {/* Sized in CSS; the canvas backing store is set from the DPR. */}
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={`h-7 flex-1 max-w-[260px] text-ink transition-opacity duration-300 ${
            mode === "speaking" ? "opacity-100" : "opacity-0"
          }`}
        />

        {source === "browser" && mode === "speaking" && (
          <span className="text-[0.72rem] text-gray-mid whitespace-nowrap">
            device voice
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[0.8rem] text-gray-mid">
          {error}
        </p>
      )}
    </div>
  );
}
