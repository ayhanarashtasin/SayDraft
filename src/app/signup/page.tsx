import type { Metadata } from "next";
import { headers } from "next/headers";
import { AuthForm } from "@/components/auth/AuthForm";
import { safeNext } from "@/lib/auth-shared";
import { isHostedHost } from "@/server/http";

export const metadata: Metadata = { title: "Create an account · Saydraft" };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  const host = (await headers()).get("host") ?? "";
  // Mirrors signupCodeRequired() in server/auth.ts (kept here so this page does not import the auth client types).
  const inviteRequired = Boolean(process.env.SIGNUP_CODE?.trim()) || process.env.NODE_ENV === "production" || isHostedHost(host);
  return <AuthForm mode="signup" next={safeNext(Array.isArray(next) ? next[0] : next)} inviteRequired={inviteRequired} />;
}
