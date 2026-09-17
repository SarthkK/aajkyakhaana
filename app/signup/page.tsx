import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getUserId()) redirect("/");
  return <AuthForm mode="signup" />;
}
