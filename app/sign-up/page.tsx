import LocalAuthForm from "@/components/auth/LocalAuthForm";
import { SignUp } from "@clerk/nextjs";
export default function SignUpPage() {
  return process.env.NEXT_PUBLIC_AUTH_PROVIDER === "betterauth" ? (
    <LocalAuthForm signUp />
  ) : (
    <main className="flex justify-center py-20">
      <SignUp routing="hash" />
    </main>
  );
}
