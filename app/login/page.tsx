import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Resolving the user rather than trusting the cookie stops a stale session from
  // being bounced straight back out of here into a redirect loop.
  if (await getCurrentUser()) redirect("/");
  return <AuthForm mode="login" />;
}
