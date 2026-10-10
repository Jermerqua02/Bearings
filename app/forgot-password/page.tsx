import { Suspense } from "react";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata = { title: "Reset your password · Lumni" };

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
