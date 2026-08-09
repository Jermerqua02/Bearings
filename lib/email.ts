/* ————————————————————————————————————————
   Email delivery.

   One place that knows how to send mail, so the templates and the sender
   identity can't drift apart across features.

   Sending never throws. A failed password-reset email is a bad day; a
   failed password-reset email that also 500s the request the user is
   sitting in front of is worse, and it leaks which addresses are
   registered. Callers get a boolean and decide.

   Not configured is a normal state, not an error: without RESEND_API_KEY
   this logs and returns false, so local development doesn't need a mail
   provider to run.
   ———————————————————————————————————————— */

import "server-only";

const ENDPOINT = "https://api.resend.com/emails";

export interface Mail {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Some clients prefer it, and spam filters like it. */
  text?: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export async function sendEmail(mail: Mail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    console.warn(
      `[email] not configured — would have sent "${mail.subject}" to ${mail.to}`,
    );
    return false;
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        ...(mail.text ? { text: mail.text } : {}),
      }),
    });

    if (!res.ok) {
      // Read the body for the reason — Resend explains rejections clearly
      // (unverified sender, invalid recipient), and that detail is the
      // difference between a two-minute fix and an afternoon.
      const detail = await res.text().catch(() => "");
      console.error(`[email] Resend returned ${res.status}: ${detail.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed:", err);
    return false;
  }
}

/* ————————————— Templates —————————————

   Plain HTML on purpose. Email clients are a hostile rendering target —
   no flexbox in Outlook, no external stylesheets in Gmail — so these use
   inline styles and a single centered column, which works everywhere. */

const SHELL = (body: string) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
            max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a;line-height:1.6">
  <p style="font-size:18px;font-weight:600;letter-spacing:-0.01em;margin:0 0 28px">Northstar</p>
  ${body}
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px" />
  <p style="font-size:12px;color:#8a8a8a;margin:0">
    Northstar is operated by Prompt LLC. If you weren't expecting this email,
    you can ignore it safely.
  </p>
</div>`;

const BUTTON = (href: string, label: string) => `
  <p style="margin:0 0 28px">
    <a href="${href}" style="display:inline-block;background:#1a1a1a;color:#ffffff;
       text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px">${label}</a>
  </p>`;

export function passwordResetEmail(url: string, name?: string): Mail {
  const greeting = name ? `Hi ${name},` : "Hi,";
  return {
    to: "",
    subject: "Reset your Northstar password",
    text: `${greeting}\n\nReset your Northstar password here:\n${url}\n\nThis link expires in one hour. If you didn't ask to reset it, ignore this email — your password won't change.`,
    html: SHELL(`
      <p style="margin:0 0 20px">${greeting}</p>
      <p style="margin:0 0 24px">Use the button below to set a new password.</p>
      ${BUTTON(url, "Set a new password")}
      <p style="margin:0 0 8px;font-size:14px;color:#5a5a5a">
        This link expires in one hour and can only be used once.
      </p>
      <p style="margin:0;font-size:14px;color:#5a5a5a">
        If you didn't ask to reset your password, you can ignore this — nothing will change.
      </p>`),
  };
}

export function parentInviteEmail(input: {
  studentName: string;
  acceptUrl: string;
}): Mail {
  return {
    to: "",
    subject: `${input.studentName} invited you to follow their college search`,
    text: `${input.studentName} is using Northstar to plan for college and has invited you to follow along.

Accept here: ${input.acceptUrl}

You'll see their progress, deadlines, school list and costs. You will not see their private conversations with the AI counselor or their essay drafts unless they choose to share them.`,
    html: SHELL(`
      <p style="margin:0 0 20px">
        <strong>${input.studentName}</strong> is using Northstar to plan for
        college, and has invited you to follow along.
      </p>
      ${BUTTON(input.acceptUrl, "Accept the invitation")}
      <p style="margin:0 0 10px;font-size:14px;color:#5a5a5a">
        <strong>What you'll see:</strong> their progress and deadlines, the
        schools on their list, and what each one would actually cost.
      </p>
      <p style="margin:0;font-size:14px;color:#5a5a5a">
        <strong>What you won't:</strong> their private conversations with the
        counselor, or their essay drafts — unless they choose to share them.
        That boundary is built into the product, not just promised here.
      </p>`),
  };
}

export function budgetAlertEmail(input: {
  threshold: number;
  spentUsd: number;
  budgetUsd: number;
  adminUrl: string;
}): Mail {
  const pct = Math.round((input.spentUsd / Math.max(input.budgetUsd, 0.01)) * 100);
  const over = input.spentUsd > input.budgetUsd;
  return {
    to: "",
    subject: over
      ? `Northstar is over budget — $${input.spentUsd.toFixed(2)} of $${input.budgetUsd.toFixed(2)}`
      : `Northstar has used ${pct}% of this month's budget`,
    text: `Spend this month: $${input.spentUsd.toFixed(2)} of $${input.budgetUsd.toFixed(2)} (${pct}%).\n\nThreshold crossed: ${input.threshold}%.\n\n${input.adminUrl}`,
    html: SHELL(`
      <p style="margin:0 0 20px">
        ${over ? "<strong>Northstar is over budget.</strong>" : `Northstar has crossed the ${input.threshold}% mark on this month's budget.`}
      </p>
      <p style="margin:0 0 24px;font-size:22px;font-weight:600">
        $${input.spentUsd.toFixed(2)}
        <span style="font-size:15px;font-weight:400;color:#8a8a8a">
          of $${input.budgetUsd.toFixed(2)} (${pct}%)
        </span>
      </p>
      ${BUTTON(input.adminUrl, "Open the cost page")}
      <p style="margin:0;font-size:14px;color:#5a5a5a">
        This covers AI usage plus infrastructure, month to date. You can change the
        budget and its alert thresholds on the cost page.
      </p>`),
  };
}
