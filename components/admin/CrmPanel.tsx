"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Plus, Search, ArrowUpRight, CalendarClock } from "lucide-react";
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
}: {
  followUps?: boolean;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<Stage | "">("");
  const [editing, setEditing] = useState<Doc<"crmContacts"> | "new" | null>(
    null,
  );
  const {
    results: visible,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.admin.contacts,
    { search: search || undefined, stage: stage || undefined, followUps },
    { initialNumItems: 48 },
  );
  return (
    <section className="crm-panel">
      <div className="crm-toolbar">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
          }}
          className="flex gap-2"
        >
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
          <Button type="submit" variant="outline" aria-label="Search">
            <Search size={16} />
          </Button>
        </form>
        <select
          aria-label="Filter contact stage"
          className="crm-select"
          value={stage}
          onChange={(event) => setStage(event.target.value as Stage | "")}
        >
          <option value="">All stages</option>
          {stages.map((value) => (
            <option key={value} value={value}>
              {labels[value]}
            </option>
          ))}
        </select>
        <Button onClick={() => setEditing("new")}>
          <Plus size={16} /> Add contact
        </Button>
      </div>
      <div className="crm-table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contact</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Follow-up</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((contact) => (
              <TableRow key={contact._id}>
                <TableCell>
                  <button
                    className="crm-contact-name"
                    onClick={() => setEditing(contact)}
                  >
                    <MemberAvatar
                      seed={contact.email || contact.name}
                      size={30}
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
                  <Tag tone={tones[contact.stage]}>{labels[contact.stage]}</Tag>
                </TableCell>
                <TableCell>{contact.owner || "Unassigned"}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <CalendarClock size={14} />
                    {formatDate(contact.nextFollowUp)}
                  </span>
                </TableCell>
                <TableCell>{contact.source || "—"}</TableCell>
              </TableRow>
            ))}
            {!visible.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="crm-empty" role="status">
                    {status === "LoadingFirstPage"
                      ? "Loading contacts…"
                      : followUps
                        ? "No scheduled follow-ups match these filters."
                        : "No contacts match. Add a contact or save an account to the CRM."}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <footer className="crm-table-footer">
        <span>
          {visible.length} {followUps ? "scheduled follow-ups" : "contacts"}{" "}
          loaded
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
          <span>All matching contacts loaded</span>
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
            {editing === "new" ? "New contact" : editing?.name}
          </DialogTitle>
          <DialogDescription>
            Keep account relationships, follow-ups and notes together.
          </DialogDescription>
          {editing && (
            <ContactEditor
              key={editing === "new" ? "new" : editing._id}
              contact={editing === "new" ? undefined : editing}
              onSaved={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
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
                <select
                  className="crm-select"
                  value={stage}
                  onChange={(event) => setStage(event.target.value as Stage)}
                >
                  {stages.map((value) => (
                    <option key={value} value={value}>
                      {labels[value]}
                    </option>
                  ))}
                </select>
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
      {notes === undefined ? (
        <p role="status">Loading notes…</p>
      ) : !notes.length ? (
        <p className="text-muted-foreground">No notes yet.</p>
      ) : (
        notes.map((note) => (
          <article key={note._id} className="crm-note">
            <p>{note.body}</p>
            <small>
              {new Date(note.createdAt).toLocaleString()} · {note.actorId}
            </small>
          </article>
        ))
      )}
    </DetailSection>
  );
}
