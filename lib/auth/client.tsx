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

/** Provider-neutral session values consumed by application components. */
interface SessionUser {
  id: string;
  fullName: string | null;
  username?: string | null;
  imageUrl?: string;
  hasImage: boolean;
  primaryEmailAddress?: { emailAddress: string } | null;
}
interface UserSession {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: SessionUser | null;
}
interface AuthSession {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: (options?: {
    template?: string;
    skipCache?: boolean;
  }) => Promise<string | null>;
}
interface AccountActions {
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
  openUserProfile: () => void;
}

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
              hasImage: !!data.user.image,
              primaryEmailAddress: data.user.email
                ? { emailAddress: data.user.email }
                : undefined,
            }
          : null,
    }),
    [isPending, isLoading, isAuthenticated, identity, signedIn, data],
  );
}
function useClerkUser(): UserSession {
  const session = Clerk.useUser();
  const user = session.user;
  return {
    isLoaded: session.isLoaded,
    isSignedIn: !!session.isSignedIn,
    user: user
      ? {
          id: user.id,
          fullName: user.fullName,
          username: user.username,
          imageUrl: user.imageUrl,
          hasImage: user.hasImage,
          primaryEmailAddress: user.primaryEmailAddress
            ? { emailAddress: user.primaryEmailAddress.emailAddress }
            : null,
        }
      : null,
  };
}
export function useUser(): UserSession {
  const useSelectedUser = better ? useBetterUser : useClerkUser;
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
export function useAuth(): AuthSession {
  const useSelectedAuth = better ? useBetterAuth : Clerk.useAuth;
  const session = useSelectedAuth();
  return {
    isLoaded: session.isLoaded,
    isSignedIn: !!session.isSignedIn,
    userId: session.userId ?? null,
    getToken: session.getToken,
  };
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
export function useAccount(): AccountActions {
  const useSelectedAccount = better ? useBetterAccount : Clerk.useClerk;
  const { signOut, openUserProfile } = useSelectedAccount();
  return { signOut, openUserProfile };
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
