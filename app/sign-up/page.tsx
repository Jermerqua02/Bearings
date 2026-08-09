import { Suspense } from "react";
import SignUpForm from "./SignUpForm";

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <SignUpForm />
    </Suspense>
  );
}
