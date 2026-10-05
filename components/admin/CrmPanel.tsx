"use client";

import { ChaosSelect } from "@/components/workspace/ChaosSelect";
import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  Plus,
  Search,
  ArrowUpRight,
  CalendarClock,
  CheckCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import MemberAvatar from "@/components/MemberAvatar";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./crm/Table";
import DetailSection from "./crm/DetailSection";
import Tag from "./crm/Tag";

const stages = ["new", "contacted", "active", "closed"] as const;
type Stage = (typeof stages)[number];
const labels: Record<Stage, string> = {
  new: "New",
  contacted: "Contacted",
  active: "Active",
  closed: "Closed",
};
const tones = {
  new: "blue",
  contacted: "purple",
  active: "green",
  closed: "neutral",
} as const;
const formatDate = (time?: number) =>
  time ? new Date(time).toLocaleDateString() : "—";

export default function CrmPanel({
  followUps = false,
  pipeline = false,
}: {
  followUps?: boolean;
  pipeline?: boolean;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<Stage | "">("");
  const [owner, setOwner] = useState("");
  const [sort, setSort] = useState("updated");
  const view = pipeline ? "pipeline" : "table";
  const [selected, setSelected] = useState<Id<"crmContacts">[]>([]);
  const [editing, setEditing] = useState<Id<"crmContacts"> | "new" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changeStages = useMutation(api.admin.setContactStages);
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.contacts,
    { search: search || undefined, stage: stage || undefined, followUps },
    { initialNumItems: 48 },
  );
  const contacts = results
    .filter(
      (contact) =>
        !owner ||
        (owner === "unassigned" ? !contact.owner : contact.owner === owner),
    )
    .toSorted((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "followup"
          ? (a.nextFollowUp ?? Infinity) - (b.nextFollowUp ?? Infinity)
          : b.updatedAt - a.updatedAt,
    );
  const selectedVisible = selected.filter((id) =>
    contacts.some((contact) => contact._id === id),
  );
  const allSelected =
    contacts.length > 0 && selectedVisible.length === contacts.length;
  const toggle = (id: Id<"crmContacts">) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id].slice(-48),
    );
  async function move(ids: Id<"crmContacts">[], stage: Stage) {
    setBusy(true);
    setError("");
    try {
      await changeStages({ contactIds: ids, stage });
      setSelected([]);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not change stage.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="crm-panel"
      aria-label={followUps ? "Follow-ups" : "Contact relationships"}
    >
      <div className="crm-searchbar">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setSelected([]);
          }}
          className="flex gap-2"
        >
          <Search size={16} aria-hidden="true" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={
              followUps
                ? "Find follow-ups by exact name…"
                : "Search contacts by name…"
            }
            aria-label="Search contacts"
          />
          <Button type="submit" variant="ghost">
            Search
          </Button>
        </form>

      </div>
      <div className="crm-toolbar">
        <SlidersHorizontal size={15} aria-hidden="true" />
        <ChaosSelect
          aria-label="Filter contact stage"
          className="crm-select"
          value={stage}
          onChange={(event) => {
            setStage(event.target.value as Stage | "");
            setSelected([]);
          }}
        >
          <option value="">All stages</option>
          {stages.map((value) => (
            <option key={value} value={value}>
              {labels[value]}
            </option>
          ))}
        </ChaosSelect>
        <ChaosSelect
          aria-label="Filter owner in loaded contacts"
          className="crm-select"
          value={owner}
          onChange={(event) => {
            setOwner(event.target.value);
            setSelected([]);
          }}
        >
          <option value="">All owners</option>
          <option value="unassigned">Unassigned</option>
          {[...new Set(results.map((contact) => contact.owner).filter(Boolean))]
            .sort()
            .map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
        </ChaosSelect>
        <ChaosSelect
          aria-label="Sort loaded contacts"
          className="crm-select"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="updated">Last activity</option>
          <option value="name">Name</option>
          <option value="followup">Follow-up date</option>
        </ChaosSelect>
        <Button className="ms-auto" onClick={() => setEditing("new")}>
          <Plus size={16} /> New contact
        </Button>
      </div>
      {selectedVisible.length > 0 && (
        <div className="crm-selectionbar">
          <span>{selectedVisible.length} selected</span>
          <ChaosSelect
            className="crm-select"
            aria-label="Move selected contacts to stage"
            value=""
            disabled={busy}
            onChange={(event) => {
              if (event.target.value)
                void move(selectedVisible, event.target.value as Stage);
            }}
          >
            <option value="">Move to stage…</option>
            {stages.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </ChaosSelect>
          <Button variant="ghost" onClick={() => setSelected([])}>
            Clear selection
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive p-4">
          {error}
        </p>
      )}
      {view === "pipeline" ? (
        <div className="crm-board">
          {stages.map((value) => (
            <section
              key={value}
              className="crm-board-column"
              aria-label={`${labels[value]} stage`}
            >
              <header>
                <Tag tone={tones[value]}>{labels[value]}</Tag>
                <span>
                  {contacts.filter((contact) => contact.stage === value).length}{" "}
                  loaded
                </span>
              </header>
              <div className="crm-board-cards">
                {contacts
                  .filter((contact) => contact.stage === value)
                  .map((contact) => (
                    <article key={contact._id} className="crm-board-card">
                      <button
                        className="crm-contact-name"
                        onClick={() => setEditing(contact._id)}
                      >
                        <MemberAvatar
                          seed={contact.email || contact.name}
                          size={30}
                        />
                        <span>
                          <strong>{contact.name}</strong>
                          <small>
                            {contact.organization ||
                              contact.email ||
                              "No organization"}
                          </small>
                        </span>
                      </button>
                      <p>{contact.owner || "Unassigned"}</p>
                      <p
                        className={
                          contact.nextFollowUp &&
                          contact.nextFollowUp < Date.now()
                            ? "crm-overdue"
                            : ""
                        }
                      >
                        <CalendarClock size={13} />{" "}
                        {formatDate(contact.nextFollowUp)}
                      </p>
                      <ChaosSelect
                        className="crm-select"
                        aria-label={`Stage for ${contact.name}`}
                        value={contact.stage}
                        disabled={busy}
                        onChange={(event) =>
                          void move([contact._id], event.target.value as Stage)
                        }
                      >
                        {stages.map((stage) => (
                          <option key={stage} value={stage}>
                            {labels[stage]}
                          </option>
                        ))}
                      </ChaosSelect>
                    </article>
                  ))}
                {!contacts.some((contact) => contact.stage === value) && (
                  <p className="crm-board-empty">No loaded contacts</p>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : !contacts.length ? (
        <div className="ws-empty" role="status">
          <h2>{status === "LoadingFirstPage" ? "Loading contacts..." : search || stage || owner ? "No contacts match" : followUps ? "No follow-ups due" : "No contacts yet"}</h2>
          <p>{status === "LoadingFirstPage" ? "" : search || stage || owner ? "Try another search or clear the filters." : followUps ? "Scheduled follow-ups will appear here." : "Add an organization contact, or add someone from Accounts."}</p>
        </div>
      ) : (
        <div className="crm-table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <input
                    type="checkbox"
                    aria-label="Select loaded contacts (up to 48)"
                    checked={allSelected}
                    onChange={() =>
                      setSelected(
                        allSelected
                          ? []
                          : contacts.slice(0, 48).map((contact) => contact._id),
                      )
                    }
                  />
                </TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Follow-up</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow
                  key={contact._id}
                  data-selected={selected.includes(contact._id)}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Select ${contact.name}`}
                      checked={selected.includes(contact._id)}
                      onChange={() => toggle(contact._id)}
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      className="crm-contact-name"
                      onClick={() => setEditing(contact._id)}
                    >
                      <MemberAvatar
                        seed={contact.email || contact.name}
                        size={28}
                      />
                      <span>
                        <strong>{contact.name}</strong>
                        <small>{contact.email || "No email added"}</small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  </TableCell>
                  <TableCell>{contact.organization || "—"}</TableCell>
                  <TableCell>
                    <Tag tone={tones[contact.stage]}>
                      {labels[contact.stage]}
                    </Tag>
                  </TableCell>
                  <TableCell>{contact.owner || "Unassigned"}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-2 ${contact.nextFollowUp && contact.nextFollowUp < Date.now() ? "crm-overdue" : ""}`}
                    >
                      <CalendarClock size={14} />
                      {formatDate(contact.nextFollowUp)}
                    </span>
                  </TableCell>
                  <TableCell>{formatDate(contact.updatedAt)}</TableCell>
                </TableRow>
              ))}

            </TableBody>
          </Table>
        </div>
      )}
      <footer className="crm-table-footer">
        <span>
          {contacts.length} shown · {results.length} loaded
          {status !== "Exhausted"
            ? " ? Load more to include more contacts in this view"
            : ""}
        </span>
        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <Button
            variant="ghost"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(48)}
          >
            {status === "LoadingMore" ? "Loading…" : "Load more"}
          </Button>
        ) : (
          <span>
            {status === "LoadingFirstPage"
              ? "Loading…"
              : "All matching contacts loaded"}
          </span>
        )}
      </footer>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="workspace-ui crm-contact-dialog">
          <DialogTitle>
            {editing === "new" ? "New contact" : "Contact details"}
          </DialogTitle>
          <DialogDescription>
            Account relationship, pipeline, follow-ups and activity.
          </DialogDescription>
          {editing === "new" ? (
            <ContactEditor onSaved={() => setEditing(null)} />
          ) : (
            editing && (
              <ContactDetail
                key={editing}
                contactId={editing}
                onSaved={() => setEditing(null)}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ContactDetail({
  contactId,
  onSaved,
}: {
  contactId: Id<"crmContacts">;
  onSaved: () => void;
}) {
  const contact = useQuery(api.admin.contact, { contactId });
  const complete = useMutation(api.admin.completeContactFollowUp);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (contact === undefined)
    return (
      <p role="status" className="p-5">
        Loading contact…
      </p>
    );
  if (contact === null) return <p className="p-5">Contact no longer exists.</p>;
  return (
    <div className="crm-detail-body">
      <div className="crm-detail-summary">
        <MemberAvatar seed={contact.email || contact.name} size={44} />
        <div>
          <h2>{contact.name}</h2>
          <p>{contact.organization || contact.email}</p>
          <Tag tone={tones[contact.stage]}>{labels[contact.stage]}</Tag>
        </div>
      </div>
      {contact.nextFollowUp !== undefined && (
        <div className="crm-followup">
          <CalendarClock size={16} />
          <span>Follow up {formatDate(contact.nextFollowUp)}</span>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await complete({ contactId });
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Could not complete follow-up.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <CheckCheck size={15} />
            {busy ? "Saving?" : "Complete"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive p-5">
          {error}
        </p>
      )}
      <ContactEditor contact={contact} onSaved={onSaved} />
    </div>
  );
}

function ContactEditor({
  contact,
  onSaved,
}: {
  contact?: Doc<"crmContacts">;
  onSaved: () => void;
}) {
  const save = useMutation(api.admin.saveContact);
  const [name, setName] = useState(contact?.name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [organization, setOrganization] = useState(contact?.organization ?? "");
  const [stage, setStage] = useState<Stage>(contact?.stage ?? "new");
  const [owner, setOwner] = useState(contact?.owner ?? "");
  const [source, setSource] = useState(contact?.source ?? "");
  const [followUp, setFollowUp] = useState(
    contact?.nextFollowUp
      ? new Date(contact.nextFollowUp).toLocaleDateString("en-CA")
      : "",
  );
  const [savedFollowUp, setSavedFollowUp] = useState(contact?.nextFollowUp);
  if (savedFollowUp !== contact?.nextFollowUp) {
    setSavedFollowUp(contact?.nextFollowUp);
    setFollowUp(contact?.nextFollowUp ? new Date(contact.nextFollowUp).toLocaleDateString("en-CA") : "");
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await save({
        id: contact?._id,
        userId: contact?.userId,
        name,
        email,
        organization,
        stage,
        owner,
        source,
        nextFollowUp: followUp
          ? new Date(`${followUp}T12:00:00`).getTime()
          : undefined,
      });
      onSaved();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save contact.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="crm-editor-scroll">
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <DetailSection title="Contact details">
            <div className="crm-field-grid">
              <label>
                Name
                <Input
                  required
                  maxLength={200}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Email
                <Input
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label>
                Organization
                <Input
                  maxLength={200}
                  value={organization}
                  onChange={(event) => setOrganization(event.target.value)}
                />
              </label>
              <label>
                Source
                <Input
                  maxLength={200}
                  placeholder="School, referral, support…"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                />
              </label>
            </div>
          </DetailSection>
          <DetailSection title="Relationship">
            <div className="crm-field-grid">
              <label>
                Stage
                <ChaosSelect
                  className="crm-select"
                  value={stage}
                  onChange={(event) => setStage(event.target.value as Stage)}
                >
                  {stages.map((value) => (
                    <option key={value} value={value}>
                      {labels[value]}
                    </option>
                  ))}
                </ChaosSelect>
              </label>
              <label>
                Owner
                <Input
                  maxLength={200}
                  placeholder="Team member"
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                />
              </label>
              <label>
                Next follow-up
                <Input
                  type="date"
                  value={followUp}
                  onChange={(event) => setFollowUp(event.target.value)}
                />
              </label>
            </div>
          </DetailSection>
          {error && (
            <p role="alert" className="text-destructive px-5 py-2">
              {error}
            </p>
          )}
          <div className="flex justify-end p-5">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save contact"}
            </Button>
          </div>
        </fieldset>
      </form>
      {contact && <ContactNotes contactId={contact._id} />}
    </div>
  );
}

function ContactNotes({ contactId }: { contactId: Id<"crmContacts"> }) {
  const notes = useQuery(api.admin.contactNotes, { contactId });
  const addNote = useMutation(api.admin.addContactNote);
  const activity = useQuery(api.admin.contactActivity, { contactId });
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await addNote({ contactId, body });
      setBody("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save note.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <DetailSection title="Notes & activity">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          New note
          <textarea
            className="crm-note-input"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
            required
            disabled={busy}
          />
        </label>
        <Button type="submit" variant="outline" disabled={busy || !body.trim()}>
          {busy ? "Saving…" : "Add note"}
        </Button>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </form>
      {notes === undefined || activity === undefined ? <p role="status">Loading activity…</p> : (
        <ol className="crm-timeline">
          {[
            ...notes.map(note => ({ id: note._id, title: "Note", body: note.body, createdAt: note.createdAt, actorId: note.actorId })),
            ...activity.filter(event => event.action !== "crm_note_added").map(event => ({ id: event._id, title: event.action.replace(/^crm_/, "").replaceAll("_", " "), body: event.reason, createdAt: event.createdAt, actorId: event.actorId })),
          ].toSorted((a, b) => b.createdAt - a.createdAt).map(event => (
            <li key={event.id}><strong>{event.title}</strong><p className="whitespace-pre-wrap break-words">{event.body}</p><small>{new Date(event.createdAt).toLocaleString()} · {event.actorId}</small></li>
          ))}
        </ol>
      )}
    </DetailSection>
  );
}
