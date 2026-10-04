import LocalAuthForm from "@/components/auth/LocalAuthForm";
import { SignIn } from "@clerk/nextjs";
export default function SignInPage() {
  return process.env.NEXT_PUBLIC_AUTH_PROVIDER === "betterauth" ? (
    <LocalAuthForm />
  ) : (
    <main className="flex justify-center py-20">
      <SignIn routing="hash" />
    </main>
  );
}
