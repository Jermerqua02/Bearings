/* ————————————————————————————————————————
   Text to speech.

   Anthropic's API has no audio output, so this is the one place Lumni
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
  Best first. 3.8 Flash TTS is generally available — not a preview — so it
  has real rate limits, and it's the fastest: a nine-second reply comes back
  in about four seconds, where the 3.1 preview took ten or timed out (and
  one failure used to send the iPhone to its own, robotic voice). Each falls
  through to the next on any error, including a 429 on that model's quota.
*/
const MODELS = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts"];
const endpoint = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
/**
 * The app stops waiting at 12s and uses its own voice, so every attempt
 * together has to fit inside this.
 */
const BUDGET_MS = 11_000;
/**
 * One attempt: longer lines take longer to voice (~15 characters a second
 * of speech, generated at about half real time), so a short question isn't
 * left hanging on a stuck request and a long reply isn't cut off.
 */
const attemptMs = (chars: number) => Math.min(9_000, Math.max(5_000, 2_500 + (chars / 15) * 600));

/*
  Delivery. The models take direction differently, and getting it wrong is
  loud: 3.8 reads a plain-English instruction out as part of the line (an
  18-second clip for 5 seconds of text) and refuses a system instruction,
  but follows an inline audio tag. 2.5 follows the plain sentence and
  doesn't speak it. Checked by clip length, 2026-10-09.
*/
const STYLE_25 =
  "Read this aloud the way a warm, encouraging college counselor talks to a student across a table: relaxed, natural pace, friendly and sincere, never announcer-like.\n\n";
function directed(model: string, text: string): string {
  return model.startsWith("gemini-2.5") ? STYLE_25 + text : `[warmly] ${text}`;
}

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
/**
 * Gemini's audio, as one clean WAV. Models differ: 2.5 sends raw PCM
 * (`audio/l16; rate=24000`), 3.8 sends a whole WAV of its own with a
 * provenance metadata chunk after the samples. Wrapping 3.8's file in a
 * second header played its header and that metadata as sound — a click at
 * the start and a sharp burst of static at the end of every line. So a WAV
 * is unpacked to just its samples first.
 */
function toWav(audio: Buffer): Buffer {
  return pcmToWav(audio.subarray(0, 4).toString("latin1") === "RIFF" ? samplesOf(audio) : audio);
}

/** The `data` chunk of a WAV, walking the chunks rather than assuming a 44-byte header. */
function samplesOf(wav: Buffer): Buffer {
  let at = 12; // "RIFF", size, "WAVE"
  while (at + 8 <= wav.length) {
    const id = wav.subarray(at, at + 4).toString("latin1");
    const size = wav.readUInt32LE(at + 4);
    if (id === "data") return wav.subarray(at + 8, Math.min(wav.length, at + 8 + size));
    at += 8 + size + (size % 2); // chunks are padded to an even length
  }
  return Buffer.alloc(0);
}

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

/*
  Lines said more than once, kept as audio. Interview practice opens with
  one of six fixed questions — the same words for every student — and "Hear
  it again" asks for the line it just played. Both used to be generated and
  billed every time. Bounded: a line is ~0.5 MB of WAV, so 64 of them is a
  few dozen MB at most; the least recently used goes first. Per process, so
  a deploy starts it empty, which costs six questions' worth of audio.
*/
const SPOKEN = new Map<string, SpeechResult>();
const SPOKEN_MAX = 64;

/** The same line again, from memory: no call, no cost. Null when it isn't held. */
export function spokenBefore(text: string): SpeechResult | null {
  const key = text.trim().slice(0, MAX_SPEECH_CHARS);
  const hit = SPOKEN.get(key);
  if (!hit) return null;
  SPOKEN.delete(key); // re-inserted below: most recently used last
  SPOKEN.set(key, hit);
  return hit;
}

function remember(text: string, result: SpeechResult) {
  SPOKEN.set(text, result);
  while (SPOKEN.size > SPOKEN_MAX) SPOKEN.delete(SPOKEN.keys().next().value!);
}

export async function synthesize(text: string): Promise<SpeechResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const trimmed = text.trim().slice(0, MAX_SPEECH_CHARS);
  if (!trimmed) return null;

  const deadline = Date.now() + BUDGET_MS;
  for (const model of MODELS) {
    const left = deadline - Date.now();
    if (left < 2_000) break;
    const result = await attempt(model, key, trimmed, Math.min(attemptMs(trimmed.length), left));
    if (result) {
      remember(trimmed, result);
      return result;
    }
  }
  return null;
}

/** One model, once. Null on any failure, so the next model gets a turn. */
async function attempt(model: string, key: string, text: string, timeoutMs: number): Promise<SpeechResult | null> {
  try {
    const res = await fetch(`${endpoint(model)}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        contents: [{ parts: [{ text: directed(model, text) }] }],
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
      wav: toWav(Buffer.from(base64, "base64")),
      model,
      inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    };
  } catch (err) {
    console.error(`[tts] ${model} failed:`, err);
    return null;
  }
}
