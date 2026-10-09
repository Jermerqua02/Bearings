/* ————————————————————————————————————————
   Text to speech.

   Anthropic's API has no audio output, so this is the one place Bearings
   talks to a second model provider. Everything else — the counselor, essay
   critique, interview practice — stays on Claude.

   Gemini returns raw PCM (`audio/l16; rate=24000; channels=1`), which no
   browser will play directly. We prepend a 44-byte RIFF header here rather
   than in the client: it keeps the decoding knowledge server-side, and the
   client just receives audio/wav and hands it to the Web Audio API.

   Never throws. Speech is an enhancement — if it fails, the caller falls
   back to the device's built-in voice (the browser's, or iOS's), and the
   student still hears it.
   ———————————————————————————————————————— */

import "server-only";

/*
  Best first. The 3.1 preview is often turned away with 503 "high demand"
  (or 429 on quota), and one failure used to send the iPhone to its own,
  robotic voice for the rest of the sitting. 2.5 Flash has the same voices
  and answers in about 2.5s, so a busy 3.1 falls through to it instead.
*/
const MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
const endpoint = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
/** Per attempt: long enough for 3.1 on a slow day, short enough to leave the fallback time inside the app's 12s. */
const ATTEMPT_MS = 7000;

/*
  Delivery, in plain words — Gemini's TTS takes direction like this and
  doesn't read it out (checked: a directed clip is no longer than a plain
  one). Without it the voice reads like an announcer.
*/
const STYLE =
  "Read this aloud the way a warm, encouraging college counselor talks to a student across a table: relaxed, natural pace, friendly and sincere, never announcer-like.\n\n";

/**
 * Voice. Kore reads as warm and even — it suits reading a student's own
 * profile back to them, and it's the counselor's voice in interview
 * practice on iOS, where she asks each question and gives her reaction
 * aloud. Those are the two things this is used for.
 */
const VOICE = "Kore";

/** Gemini's PCM output format, fixed by the API rather than chosen by us. */
const SAMPLE_RATE = 24_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

/** Guardrail: a runaway request shouldn't be able to bill an essay's worth of audio. */
export const MAX_SPEECH_CHARS = 3000;

export interface SpeechResult {
  wav: Buffer;
  /** The model that spoke it — the fallback is billed under its own name. */
  model: string;
  /** Audio tokens billed, for lib/counselor/usage.ts. */
  outputTokens: number;
  inputTokens: number;
}

/** Wrap raw little-endian PCM in a minimal RIFF/WAVE container. */
function pcmToWav(pcm: Buffer): Buffer {
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const byteRate = SAMPLE_RATE * blockAlign;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4); // file size minus the first 8 bytes
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // format 1 = uncompressed PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export function speechConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function synthesize(text: string): Promise<SpeechResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const trimmed = text.trim().slice(0, MAX_SPEECH_CHARS);
  if (!trimmed) return null;

  for (const model of MODELS) {
    const result = await attempt(model, key, trimmed);
    if (result) return result;
  }
  return null;
}

/** One model, once. Null on any failure, so the next model gets a turn. */
async function attempt(model: string, key: string, text: string): Promise<SpeechResult | null> {
  try {
    const res = await fetch(`${endpoint(model)}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(ATTEMPT_MS),
      body: JSON.stringify({
        contents: [{ parts: [{ text: STYLE + text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
          },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[tts] ${model} returned ${res.status}: ${detail.slice(0, 300)}`);
      return null;
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const base64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) {
      console.error(`[tts] ${model} returned no audio payload`);
      return null;
    }

    return {
      wav: pcmToWav(Buffer.from(base64, "base64")),
      model,
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    };
  } catch (err) {
    console.error(`[tts] ${model} failed:`, err);
    return null;
  }
}
