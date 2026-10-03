"use client";

import * as Clerk from "@clerk/nextjs";
import { arSA } from "@clerk/localizations/ar-SA";
import { authClient } from "./better-client";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import { safeAuthReturn } from "./redirect";

const better = process.env.NEXT_PUBLIC_AUTH_PROVIDER === "betterauth";
export function AuthProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  return better ? (
    <>{children}</>
  ) : (
    <Clerk.ClerkProvider
      dynamic
      localization={locale === "ar" ? arSA : undefined}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      afterSignOutUrl="/"
    >
      {children}
    </Clerk.ClerkProvider>
  );
}
function useBetterUser() {
  const { data, isPending } = authClient.useSession();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const identity = useQuery(
    api.authIdentity.resolveCurrent,
    isAuthenticated ? {} : "skip",
  );
  const signedIn = !!data && isAuthenticated && !!identity;
  return useMemo(
    () => ({
      isLoaded:
        !isPending &&
        !isLoading &&
        (!isAuthenticated || identity !== undefined),
      isSignedIn: signedIn,
      user:
        signedIn && data && identity
          ? {
              id: identity.actorId,
              fullName: data.user.name,
              username: undefined,
              imageUrl: data.user.image ?? undefined,
              primaryEmailAddress: data.user.email
                ? { emailAddress: data.user.email }
                : undefined,
            }
          : null,
    }),
    [isPending, isLoading, isAuthenticated, identity, signedIn, data],
  );
}
export function useUser() {
  const useSelectedUser = better ? useBetterUser : Clerk.useUser;
  return useSelectedUser();
}
function useBetterAuth() {
  const { isLoaded, isSignedIn, user } = useBetterUser();
  const getToken = useCallback(
    async (_options?: { template?: string; skipCache?: boolean }) => {
      const result = await authClient.convex.token();
      return result.data?.token ?? null;
    },
    [],
  );
  return { isLoaded, isSignedIn, userId: user?.id ?? null, getToken };
}
export function useAuth() {
  const useSelectedAuth = better ? useBetterAuth : Clerk.useAuth;
  return useSelectedAuth();
}
function useBetterAccount() {
  const router = useRouter();
  return {
    signOut: async ({ redirectUrl = "/" }: { redirectUrl?: string } = {}) => {
      const result = await authClient.signOut();
      if (!result.error)
        window.location.assign(safeAuthReturn(redirectUrl, "/"));
    },
    openUserProfile: () => {
      router.push("/auth/account");
    },
  };
}
export function useClerk() {
  const useSelectedAccount = better ? useBetterAccount : Clerk.useClerk;
  return useSelectedAccount();
}
type ButtonProps = {
  children: ReactNode;
  mode?: "modal" | "redirect";
  forceRedirectUrl?: string;
  signInForceRedirectUrl?: string;
  signUpForceRedirectUrl?: string;
};
function BetterSignInButton({
  children,
  forceRedirectUrl,
  signUp = false,
}: ButtonProps & { signUp?: boolean }) {
  const router = useRouter();
  const begin = () => {
    router.push(
      `${signUp ? "/sign-up" : "/sign-in"}?callbackUrl=${encodeURIComponent(safeAuthReturn(forceRedirectUrl ?? `${window.location.pathname}${window.location.search}`))}`,
    );
  };
  return isValidElement(children) ? (
    cloneElement(children as ReactElement<{ onClick?: () => void }>, {
      onClick: begin,
    })
  ) : (
    <button onClick={begin}>{children}</button>
  );
}
function BetterSignOutButton({ children }: ButtonProps) {
  const { signOut } = useBetterAccount();
  const end = () =>
    void signOut({
      redirectUrl: `${window.location.pathname}${window.location.search}`,
    });
  return isValidElement(children) ? (
    cloneElement(children as ReactElement<{ onClick?: () => void }>, {
      onClick: end,
    })
  ) : (
    <button onClick={end}>{children}</button>
  );
}
export function SignInButton(props: ButtonProps) {
  return better ? (
    <BetterSignInButton {...props} />
  ) : (
    <Clerk.SignInButton {...props} />
  );
}
export function SignUpButton(props: ButtonProps) {
  return better ? (
    <BetterSignInButton {...props} signUp />
  ) : (
    <Clerk.SignUpButton {...props} />
  );
}
export function SignOutButton(props: ButtonProps) {
  return better ? (
    <BetterSignOutButton {...props} />
  ) : (
    <Clerk.SignOutButton {...props} />
  );
}
