/* Email every admin (or the configured alert address) — for things that
   want a person's attention: a free-access request, a school inquiry. */

import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminSettings, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";

export async function notifyAdmins(mail: { subject: string; html: string; text?: string }): Promise<void> {
  try {
    const [settings] = await db.select({ alertEmail: adminSettings.alertEmail }).from(adminSettings).limit(1);
    const configured = settings?.alertEmail?.trim();
    const to = configured
      ? [configured]
      : (await db.select({ email: users.email }).from(users).where(eq(users.role, "admin"))).map((a) => a.email);
    await Promise.all(to.map((address) => sendEmail({ ...mail, to: address })));
  } catch (err) {
    // A notice that didn't go out never fails the request it was about.
    console.error("[admin-notify] could not send:", err);
  }
}

export const adminUrl = (path: string) => `${process.env.BETTER_AUTH_URL ?? ""}${path}`;
