/* Browser-harness stand-ins for the Next and Convex boundaries. The editor, BlockNote, schema,
   menus and custom renderers above them are the real ones. */
import { lazy, Suspense, forwardRef, type ComponentType, type ReactNode } from "react";

export function dynamic<P extends object>(load: () => Promise<ComponentType<P> | { default: ComponentType<P> }>, options?: { loading?: () => ReactNode }) {
  const Lazy = lazy(async () => {
    const mod = await load();
    return { default: (typeof mod === "function" ? mod : (mod as { default: ComponentType<P> }).default) };
  });
  return function Dynamic(props: P) {
    return <Suspense fallback={options?.loading?.() ?? null}><Lazy {...(props as P & React.JSX.IntrinsicAttributes)} /></Suspense>;
  };
}
export default dynamic;

export const Link = forwardRef<HTMLAnchorElement, { href: string; children?: ReactNode; prefetch?: unknown } & React.AnchorHTMLAttributes<HTMLAnchorElement>>(function Link({ href, children, prefetch: _prefetch, ...rest }, ref) {
  return <a ref={ref} href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>;
});

const noopRouter = { push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} };
export const useRouter = () => noopRouter;
export const usePathname = () => "/en/dashboard/learn/lessons/harness";
export const useSearchParams = () => new URLSearchParams();
export const useParams = () => ({ lang: "en", id: "harness" });
export const redirect = () => {};
export const notFound = () => {};

/* convex/react */
export const useQuery = () => undefined;
export const useQueries = (q: Record<string, unknown>) => Object.fromEntries(Object.keys(q).map((k) => [k, undefined]));
export const usePaginatedQuery = () => ({ results: [], status: "Exhausted", isLoading: false, loadMore: () => {} });
const mutation = Object.assign(async () => null, { withOptimisticUpdate: () => mutation });
export const useMutation = () => mutation;
export const useAction = () => mutation;
const client = { query: async () => undefined, mutation: async () => null, action: async () => null, watchQuery: () => ({ onUpdate: () => () => {}, localQueryResult: () => undefined }), prewarmQuery: () => {} };
export const useConvex = () => client;
export const useConvexAuth = () => ({ isAuthenticated: true, isLoading: false });
export const useConvexConnectionState = () => ({ isWebSocketConnected: true, hasEverConnected: true, connectionCount: 1, connectionRetries: 0, hasInflightRequests: false, timeOfOldestInflightRequest: null, inflightMutations: 0, inflightActions: 0 });
export const ConvexProvider = ({ children }: { children: ReactNode }) => children;
export class ConvexReactClient { constructor() {} }
