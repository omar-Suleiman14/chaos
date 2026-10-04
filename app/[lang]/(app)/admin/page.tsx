"use client";
import DocumentationPanel from "@/components/admin/DocumentationPanel";
import Link from "next/link";
import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import MemberAvatar from "@/components/MemberAvatar";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CrmPanel from "@/components/admin/CrmPanel";
import SidebarNavItem from "@/components/admin/crm/SidebarNavItem";
import "@/components/admin/crm/crm.css";
import { supportEmail } from "@/lib/site";
import {
  Shield,
  ArrowLeft,
  Search,
  Users,
  FileText,
  BarChart3,
  History,
  Columns3,
} from "lucide-react";

const adminTabs = [
  { id: "contacts", icon: Users, label: "Contacts" },
  { id: "pipeline", icon: Columns3, label: "Pipeline" },
  { id: "followups", icon: History, label: "Follow-ups" },
  { id: "overview", icon: BarChart3, label: "Overview" },
  { id: "users", icon: Users, label: "Accounts" },
  { id: "forms", icon: FileText, label: "Forms" },
  { id: "quizzes", icon: FileText, label: "Legacy quizzes" },
  { id: "docs", icon: FileText, label: "Documentation" },
  { id: "activity", icon: History, label: "Activity" },
];
const date = (time: number) => new Date(time).toLocaleString();
type User = FunctionReturnType<typeof api.admin.users>["page"][number];
type Content = FunctionReturnType<typeof api.admin.content>["page"][number];
type Action = {
  title: string;
  description: string;
  run: (reason: string, days: number) => Promise<unknown>;
  suspension?: boolean;
};
type ChooseAction = (action: Action) => void;

export default function AdminPage() {
  return process.env.NEXT_PUBLIC_CONVEX_URL ? (
    <AdminGate />
  ) : (
    <Notice
      title="Admin unavailable"
      text="This deployment has no backend configured."
    />
  );
}
function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="workspace-ui min-h-screen bg-background p-8 flex flex-col items-center justify-center gap-4">
      <Shield size={32} />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{text}</p>
      <Link href="/dashboard" className="underline">
        Back to workspace
      </Link>
    </div>
  );
}
function AdminGate() {
  const admin = useQuery(api.quizFunctions.getIsAdmin);
  if (admin === undefined)
    return (
      <Notice
        title="Checking access…"
        text="Loading your account permissions."
      />
    );
  if (!admin)
    return (
      <Notice
        title="Admin access required"
        text="Sign in with your verified administrator account."
      />
    );
  return <AdminConsole />;
}
function AdminConsole() {
  const [tab, setTab] = useState("contacts");
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const choose: ChooseAction = (next) => {
    setAction(next);
    setReason("");
    setDays(7);
    setError("");
    setMessage("");
  };
  async function confirm() {
    if (!action) return;
    setBusy(true);
    setError("");
    try {
      await action.run(reason, days);
      setMessage(`${action.title}: saved.`);
      setAction(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace-ui chaos-admin bg-background text-foreground">
      <aside className="crm-sidebar">
        <div className="crm-brand">
          <Shield size={28} />
          <div>
            <strong>Chaos</strong>
            <small>Admin workspace</small>
          </div>
        </div>
        <nav aria-label="Admin sections">
          <p className="crm-nav-heading">Relationships & operations</p>
          {adminTabs.map(({ id, icon, label }) => (
            <SidebarNavItem
              key={id}
              icon={icon}
              label={label}
              active={tab === id}
              onClick={() => setTab(id)}
            />
          ))}
        </nav>
        <Link href="/dashboard" className="crm-sidebar-footer">
          <ArrowLeft size={16} />
          Back to workspace
        </Link>
      </aside>
      <div className="crm-admin-body">
        <header className="crm-admin-header">
          <div>
            <h1>{adminTabs.find((item) => item.id === tab)?.label}</h1>
            <p>Chaos / Administration</p>
          </div>
          <a
            className="text-sm text-muted-foreground"
            href={`mailto:${supportEmail}`}
          >
            Support
          </a>
        </header>
        <main className="crm-admin-main space-y-7">
          {message && (
            <p role="status" className="rounded-lg bg-muted p-3 text-sm">
              {message}
            </p>
          )}
          {tab === "contacts" || tab === "followups" || tab === "pipeline" ? (
            <CrmPanel
              key={tab}
              followUps={tab === "followups"}
              pipeline={tab === "pipeline"}
            />
          ) : tab === "docs" ? (
            <DocumentationPanel />
          ) : tab === "overview" ? (
            <Overview />
          ) : tab === "users" ? (
            <UsersPanel choose={choose} />
          ) : tab === "activity" ? (
            <Activity />
          ) : (
            <ContentPanel
              key={tab}
              kind={tab as "forms" | "quizzes"}
              choose={choose}
            />
          )}
        </main>
      </div>
      <Dialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !busy) setAction(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{action?.title}</DialogTitle>
          <DialogDescription>{action?.description}</DialogDescription>
          {action?.suspension && (
            <label className="space-y-2 text-sm">
              Suspension length (days)
              <Input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </label>
          )}
          <label className="space-y-2 text-sm">
            Reason for the activity log
            <Input
              autoFocus
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you making this change?"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                !reason.trim() ||
                (!!action?.suspension &&
                  (!Number.isInteger(days) || days < 1 || days > 365))
              }
              onClick={confirm}
            >
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Overview() {
  const report = useQuery(api.adminAnalytics.overview);
  const refresh = useMutation(api.adminAnalytics.refresh);
  const [error, setError] = useState("");
  const update = async () => {
    setError("");
    try {
      await refresh({});
    } catch {
      setError("Could not refresh analytics. Try again.");
    }
  };
  if (report === undefined) return <p role="status">Loading analytics…</p>;
  if (!report || !report.completedAt)
    return (
      <div className="space-y-3">
        <p>
          {report?.running
            ? "Calculating platform totals…"
            : "Calculate platform totals to get started."}
        </p>
        <Button onClick={update} disabled={report?.running}>
          Refresh analytics
        </Button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  const stats = report.counts;
  const metrics = [
    ["Accounts", stats.users],
    ["Restricted accounts", stats.restricted],
    ["Live forms", `${stats.liveForms} / ${stats.forms}`],
    ["Live legacy quizzes", `${stats.liveQuizzes} / ${stats.quizzes}`],
    ["Form responses", stats.responses],
    ["Partial responses", stats.partials],
    [
      "Quiz completion",
      stats.attempts
        ? `${Math.round((stats.completedAttempts / stats.attempts) * 100)}%`
        : "—",
    ],
  ];
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Operational overview</h2>
        <p className="text-sm text-muted-foreground mt-1">
          All accounts and content, scanned in batches. Updated{" "}
          {date(report.completedAt)}. Refreshes hourly; activity during a scan
          may appear in the next refresh.
        </p>
      </div>
      <Button variant="outline" onClick={update} disabled={report.running}>
        {report.running ? "Refreshing..." : "Refresh analytics"}
      </Button>
      {error && <p role="alert">{error}</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-xl border p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-semibold tabular-nums mt-3">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border p-5">
        <h3 className="font-semibold">Product analytics</h3>
        <p className="text-sm text-muted-foreground mt-2">
          PostHog receives screen names, errors and a few counts, such as
          submitted responses. It never receives answers, form content, URLs or
          recordings.
        </p>
        <a
          href="https://eu.posthog.com"
          target="_blank"
          rel="noreferrer"
          className="text-sm underline inline-block mt-3"
        >
          Open PostHog
        </a>
      </div>
    </section>
  );
}
function UsersPanel({ choose }: { choose: ChooseAction }) {
  const [emailInput, setEmailInput] = useState("");
  const [email, setEmail] = useState("");
  const [crmMessage, setCrmMessage] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.users,
    email ? { email } : {},
    { initialNumItems: 25 },
  );
  const moderate = useMutation(api.admin.moderateUser);
  const saveContact = useMutation(api.admin.saveContact);
  const stateAction = (user: User, state: "active" | "suspended" | "banned") =>
    choose({
      title: `${state === "active" ? "Restore account" : state === "banned" ? "Ban account" : "Suspend account"} · ${user.name}`,
      suspension: state === "suspended",
      description:
        state === "active"
          ? "Restore editing and collection. Individual content holds remain in place."
          : "Block editing, collection on owned content, and integration access. Existing records remain readable. Bans last until you restore the account.",
      run: (reason, days) =>
        moderate({ userId: user._id, state, reason, days }),
    });
  async function addToCrm(user: User) {
    setSaving(user._id);
    setCrmMessage("");
    try {
      await saveContact({
        name: user.name,
        email: user.email,
        organization: "",
        stage: "new",
        owner: "",
        source: "Chaos account",
        userId: user._id,
      });
      setCrmMessage(`${user.name} added to Contacts.`);
    } catch (error) {
      setCrmMessage(
        error instanceof Error ? error.message : "Could not add contact.",
      );
    } finally {
      setSaving(null);
    }
  }
  return (
    <section className="space-y-4">
      <form
        className="flex gap-2 max-w-lg"
        onSubmit={(event) => {
          event.preventDefault();
          setEmail(emailInput.trim());
        }}
      >
        <Input
          aria-label="Exact account email"
          placeholder="Find an account by exact email"
          value={emailInput}
          onChange={(event) => setEmailInput(event.target.value)}
        />
        <Button variant="outline" type="submit">
          <Search size={16} />
          Search
        </Button>
        {email && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              setEmail("");
              setEmailInput("");
            }}
          >
            Clear
          </Button>
        )}
      </form>
      {crmMessage && <p role="status">{crmMessage}</p>}
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading accounts…</p>
      ) : !results.length ? (
        <p className="py-8 text-muted-foreground">No accounts found.</p>
      ) : (
        <div className="divide-y border rounded-lg">
          {results.map((user) => (
            <article
              key={user._id}
              className="p-4 flex flex-col lg:flex-row gap-4 lg:items-center"
            >
              <div className="flex gap-3 flex-1 min-w-0">
                <MemberAvatar seed={user.email || user.name} size={36} />
                <div>
                  <strong className="block font-medium">{user.name}</strong>
                  <p className="text-sm text-muted-foreground break-all">
                    {user.email} · @{user.username}
                  </p>
                  <p className="text-sm mt-2">
                    {user.state}
                    {user.suspendedUntil
                      ? ` until ${date(user.suspendedUntil)}`
                      : ""}
                  </p>
                  {user.reason && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {user.reason}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving !== null}
                  onClick={() => addToCrm(user)}
                >
                  {saving === user._id ? "Saving…" : "Add to CRM"}
                </Button>
                {user.state !== "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => stateAction(user, "active")}
                  >
                    Restore
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => stateAction(user, "suspended")}
                >
                  Suspend
                </Button>
                {user.state !== "banned" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => stateAction(user, "banned")}
                  >
                    Ban
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <LoadMore status={status} load={() => loadMore(25)} />
    </section>
  );
}
function ContentPanel({
  kind,
  choose,
}: {
  kind: "forms" | "quizzes";
  choose: ChooseAction;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.content,
    { kind },
    { initialNumItems: 25 },
  );
  const moderate = useMutation(api.admin.moderateContent);
  const [search, setSearch] = useState("");
  const visible = results.filter((item) =>
    `${item.title} ${item.ownerId} ${item.id}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function action(item: Content) {
    choose({
      title: `${item.held ? "Release hold" : "Take offline"} · ${item.title}`,
      description: item.held
        ? "The owner can publish again. Releasing a hold does not make content live automatically."
        : "This content will stop accepting responses. The owner cannot republish until you release the hold. Responses and scores are preserved.",
      run: (reason) =>
        moderate({
          targetId: item.id as Id<"forms"> | Id<"quizzes">,
          hold: !item.held,
          reason,
        }),
    });
  }
  return (
    <section className="space-y-4">
      <Input
        className="max-w-lg"
        placeholder="Filter loaded content by title, ID or owner"
        aria-label="Filter loaded content"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <p className="text-sm text-muted-foreground">
        {results.length} loaded. Load more to search older content.
      </p>
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading content…</p>
      ) : !visible.length ? (
        <p className="py-8 text-muted-foreground">No matching content.</p>
      ) : (
        <div className="border rounded-xl divide-y">
          {visible.map((item) => (
            <article key={item.id} className="p-4 flex gap-4 items-center">
              <div className="min-w-0 flex-1">
                <h3 className="font-medium break-words">
                  {item.title || "Untitled"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {item.held ? "Admin hold" : item.status}
                  {item.responses !== null
                    ? ` · ${item.responses} responses`
                    : ""}
                </p>
                <p className="text-xs text-muted-foreground break-all mt-1">
                  Owner: {item.ownerId} · {date(item.createdAt)}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => action(item)}>
                {item.held ? "Release hold" : "Take offline"}
              </Button>
            </article>
          ))}
        </div>
      )}
      <LoadMore status={status} load={() => loadMore(25)} />
    </section>
  );
}
function LoadMore({ status, load }: { status: string; load: () => void }) {
  return status === "CanLoadMore" || status === "LoadingMore" ? (
    <Button
      variant="outline"
      disabled={status === "LoadingMore"}
      onClick={load}
    >
      {status === "LoadingMore" ? "Loading…" : "Load more"}
    </Button>
  ) : null;
}
function Activity() {
  const rows = useQuery(api.admin.activity);
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Recent activity</h2>
      <p className="text-sm text-muted-foreground">
        The latest 50 moderation and plan changes.
      </p>
      {!rows ? (
        <p role="status">Loading activity…</p>
      ) : !rows.length ? (
        <p>No changes recorded yet.</p>
      ) : (
        <ol className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="py-4">
              <p className="font-medium">{row.action.replaceAll("_", " ")}</p>
              <p className="text-sm mt-1">{row.reason}</p>
              <p className="text-xs text-muted-foreground mt-1 break-all">
                {date(row.createdAt)} · {row.actorId} → {row.target}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
