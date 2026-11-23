import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { safeNext } from "@/lib/auth-shared";

export const metadata: Metadata = { title: "Create an account · Saydraft" };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="signup" next={safeNext(Array.isArray(next) ? next[0] : next)} />;
}
