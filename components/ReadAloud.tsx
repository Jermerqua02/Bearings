"use client";

import { useEffect, useRef, useState } from "react";

/* Read-aloud.

   Uses the browser's built-in SpeechSynthesis API — no API key, no network
   call, no per-use cost, and nothing leaves the device. That last point
   matters here: this reads a student's profile aloud, and sending it to a
   third-party voice service to do so would put personal information on the
   wire for a convenience feature.

   Anthropic's API has no text-to-speech, so the alternative would be adding
   a second provider (Gemini, OpenAI, ElevenLabs) purely for voice. Their
   voices are better than the OS ones. This is the version that works today
   and costs nothing; swapping in a hosted voice later means replacing this
   component and nothing else.

   Voice quality varies by platform — macOS and iOS ship good ones. We pick
   the best available English voice rather than accepting the default, which
   is often the most robotic one installed. */

const PREFERRED = [
  // macOS/iOS premium voices, best first.
  "Samantha",
  "Ava",
  "Allison",
  "Serena",
  // Chrome's hosted voices.
  "Google US English",
  "Google UK English Female",
  // Windows.
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
];

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  for (const name of PREFERRED) {
    const match = voices.find((v) => v.name === name);
    if (match) return match;
  }
  // Otherwise prefer a local en-US voice; remote ones can lag badly.
  return (
    voices.find((v) => v.lang?.startsWith("en") && v.localService) ??
    voices.find((v) => v.lang?.startsWith("en")) ??
    null
  );
}

export default function ReadAloud({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);

    // Voices load asynchronously in most browsers; getVoices() is often
    // empty on first call, so listen for the event too.
    const load = () => {
      voiceRef.current = pickVoice(window.speechSynthesis.getVoices());
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      // Leaving the page mid-sentence should stop the voice, not orphan it.
      window.speechSynthesis.cancel();
    };
  }, []);

  function toggle() {
    if (!supported) return;
    const synth = window.speechSynthesis;

    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }

    // Cancel anything already queued — otherwise utterances stack up.
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.rate = 0.98; // A touch under default reads less clipped.
    utterance.pitch = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    setSpeaking(true);
    synth.speak(utterance);
  }

  // Don't advertise a control the browser can't honour.
  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={speaking ? "Stop reading aloud" : "Read this aloud"}
      className={`inline-flex items-center gap-2 text-[0.85rem] text-gray-mid hover:text-ink transition-quiet ${className}`}
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
        {speaking ? (
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
      {speaking ? "Stop" : "Read aloud"}
    </button>
  );
}
