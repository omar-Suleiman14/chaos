import "@/components/learn/learn.css";

/** Public Learn pages (lesson reader, profiles, collections) use the workspace look without the sidebar. */
export default function PublicLearnLayout({ children }: { children: React.ReactNode }) {
  return <div className="workspace-ui">{children}</div>;
}
