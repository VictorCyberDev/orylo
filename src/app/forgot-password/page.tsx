import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ForgotForm } from "@/components/auth-forms";
export const metadata: Metadata = { title: "Reset password", robots: { index: false } };
export default function Forgot() {
  return <AuthShell title="Reset your password" subtitle="Enter your email. If it has an account we'll prepare a reset link." footer={<Link className="underline" href="/sign-in">Back to sign in</Link>}><ForgotForm /></AuthShell>;
}
