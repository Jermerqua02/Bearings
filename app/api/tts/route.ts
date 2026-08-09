/* ————————————————————————————————————————
   Speech synthesis endpoint.

   POST { text } → audio/wav.

   Behind auth, because it spends money on a third party's API and an open
   endpoint is an open invoice. Metered like every other AI call so speech
   shows up on the admin cost pages next to the counselor rather than
   quietly accruing somewhere nobody looks.
   ———————————————————————————————————————— */

import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth/policy";
import { MAX_SPEECH_CHARS, synthesize } from "@/lib/tts";
import { recordUsage } from "@/lib/counselor/usage";
import { speechCostMillicents } from "@/lib/costs";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let viewer;
  try {
    viewer = await requireViewer();
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let text: string;
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text : "";
  } catch {
    return NextResponse.json({ error: "Expected JSON with a text field" }, { status: 400 });
  }

  if (!text.trim()) {
    return NextResponse.json({ error: "Nothing to read" }, { status: 400 });
  }
  if (text.length > MAX_SPEECH_CHARS) {
    return NextResponse.json(
      { error: `Text is too long to read (limit ${MAX_SPEECH_CHARS} characters).` },
      { status: 413 },
    );
  }

  // Bound what one account can spend before calling the provider, not after.
  const rate = await checkRateLimit(viewer.userId, "speech");
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `You've used the read-aloud limit for now (${rate.limit} an hour). Try again shortly.`,
      },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const result = await synthesize(text);
  if (!result) {
    // 503 rather than 500: the caller's request was fine, the voice just
    // isn't available. The client falls back to the browser's own voice.
    return NextResponse.json({ error: "Speech is unavailable right now" }, { status: 503 });
  }

  // Priced per audio token by Gemini, so the Claude rate table doesn't apply
  // — recordUsage takes the cost we computed rather than deriving it.
  await recordUsage(
    viewer.userId,
    "speech",
    { input_tokens: result.inputTokens, output_tokens: result.outputTokens },
    "gemini-3.1-flash-tts-preview",
    speechCostMillicents(result.inputTokens, result.outputTokens),
  );

  return new NextResponse(new Uint8Array(result.wav), {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(result.wav.length),
      // Personal content: never let a shared cache hold it.
      "Cache-Control": "private, no-store",
    },
  });
}
