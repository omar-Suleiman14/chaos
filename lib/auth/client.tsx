"use client";

import * as Clerk from "@clerk/nextjs";
import { arSA } from "@clerk/localizations/ar-SA";
import { SessionProvider, useSession, getSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { cloneElement, isValidElement, useCallback, useMemo, type ReactElement, type ReactNode } from "react";
import { safeAuthReturn } from "./redirect";

const oidc = process.env.NEXT_PUBLIC_AUTH_PROVIDER === "oidc";
export function AuthProvider({ children, locale }: { children: ReactNode; locale: string }) {
  return oidc ? <SessionProvider refetchInterval={60} refetchOnWindowFocus>{children}</SessionProvider> : <Clerk.ClerkProvider dynamic localization={locale === "ar" ? arSA : undefined} signInFallbackRedirectUrl="/dashboard" signUpFallbackRedirectUrl="/dashboard" afterSignOutUrl="/">{children}</Clerk.ClerkProvider>;
}
function useOidcUser() {
  const { data, status } = useSession();
  const signedIn = status === "authenticated" && !data?.authError && !!data?.user.id;
  return useMemo(() => ({ isLoaded: status !== "loading", isSignedIn: signedIn, user: signedIn && data ? { id: data.user.id, fullName: data.user.name, username: undefined, imageUrl: data.user.image ?? undefined, primaryEmailAddress: data.user.email ? { emailAddress: data.user.email } : undefined } : null }), [status, signedIn, data]);
}
export function useUser() { const useSelectedUser = oidc ? useOidcUser : Clerk.useUser; return useSelectedUser(); }
function useOidcAuth() {
  const { data, status } = useSession();
  const getToken = useCallback(async (_options?: { template?: string; skipCache?: boolean }) => {
    const session = await getSession();
    return session?.authError ? null : session?.accessToken ?? null;
  }, []);
  return { isLoaded: status !== "loading", isSignedIn: status === "authenticated" && !data?.authError, userId: data?.authError ? null : data?.user.id ?? null, getToken };
}
export function useAuth() { const useSelectedAuth = oidc ? useOidcAuth : Clerk.useAuth; return useSelectedAuth(); }
function useOidcAccount() {
  const router = useRouter();
  return {
    signOut: ({ redirectUrl = "/" }: { redirectUrl?: string } = {}) => signOut({ callbackUrl: safeAuthReturn(redirectUrl, "/") }),
    openUserProfile: () => { router.push("/api/auth/account"); },
  };
}
export function useClerk() { const useSelectedAccount = oidc ? useOidcAccount : Clerk.useClerk; return useSelectedAccount(); }
type ButtonProps = { children: ReactNode; mode?: "modal" | "redirect"; forceRedirectUrl?: string; signInForceRedirectUrl?: string; signUpForceRedirectUrl?: string };
function OidcSignInButton({ children, forceRedirectUrl }: ButtonProps) {
  const begin = () => void signIn("keycloak", { callbackUrl: safeAuthReturn(forceRedirectUrl ?? `${window.location.pathname}${window.location.search}`) }, { prompt: "login" });
  return isValidElement(children) ? cloneElement(children as ReactElement<{ onClick?: () => void }>, { onClick: begin }) : <button onClick={begin}>{children}</button>;
}
function OidcSignOutButton({ children }: ButtonProps) {
  const end = () => void signOut({ callbackUrl: safeAuthReturn(`${window.location.pathname}${window.location.search}`, "/") });
  return isValidElement(children) ? cloneElement(children as ReactElement<{ onClick?: () => void }>, { onClick: end }) : <button onClick={end}>{children}</button>;
}
export function SignInButton(props: ButtonProps) { const Button = oidc ? OidcSignInButton : Clerk.SignInButton; return <Button {...props} />; }
export function SignUpButton(props: ButtonProps) { const Button = oidc ? OidcSignInButton : Clerk.SignUpButton; return <Button {...props} />; }
export function SignOutButton(props: ButtonProps) { const Button = oidc ? OidcSignOutButton : Clerk.SignOutButton; return <Button {...props} />; }
