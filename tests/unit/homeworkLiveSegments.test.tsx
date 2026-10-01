import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import type { FormRendererProps } from "@/components/forms/FormRenderer";
import { emptyDefinition } from "@/convex/formLogic";
import HomeworkStudent from "@/components/forms/homework/HomeworkStudent";
import HomeworkManager from "@/components/forms/homework/HomeworkManager";
import TeamPanel from "@/components/live/TeamPanel";
import Segments from "@/components/forms/results/Segments";

const m = vi.hoisted(() => ({
  authenticated: true,
  form: null as Record<string, unknown> | null,
  snapshot: null as Record<string, unknown> | null,
  progress: [] as unknown[],
  teams: [] as unknown[],
  matrix: null as Record<string, unknown> | null,
  renderer: null as unknown,
  query: vi.fn(), read: vi.fn(), start: vi.fn(), submit: vi.fn(), upload: vi.fn(), create: vi.fn(), enroll: vi.fn(), close: vi.fn(), join: vi.fn(), assign: vi.fn(), createTeam: vi.fn(), getToken: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: m.getToken }),
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: m.authenticated, isLoading: false }),
  useConvex: () => ({ query: m.read }),
  useQuery: (ref: FunctionReference<"query">, args: unknown) => {
    const name = getFunctionName(ref); m.query(name, args);
    if (args === "skip") return undefined;
    return name === "forms:getFormForEditor" ? m.form : name === "forms:getVersion" ? m.snapshot : name === "homework:myProgress" || name === "homework:report" ? m.progress : name === "liveTeams:standings" ? m.teams : name === "formSegmentAnalysis:crossTab" ? m.matrix : undefined;
  },
  useMutation: (ref: FunctionReference<"mutation">) => ({ "homework:startAttempt": m.start, "homework:submitAttempt": m.submit, "homework:generateUploadUrl": m.upload, "homework:create": m.create, "homework:enroll": m.enroll, "homework:setClosed": m.close, "liveTeams:create": m.createTeam, "liveTeams:join": m.join, "liveTeams:assign": m.assign })[getFunctionName(ref)],
}));
vi.mock("@/components/forms/FormRenderer", () => ({
  themeClass: () => "test-theme", themeStyle: () => ({}),
  default: (props: FormRendererProps) => { m.renderer = props; return <div><label>Pinned answer<input value={String(props.answers.q ?? "")} onChange={e => props.onAnswer("q", e.target.value)} /></label><button disabled={props.submitting} onClick={props.onSubmit}>{props.submitLabel}</button></div>; },
}));

const formId = "form123456" as Id<"forms">, assignmentId = "assignment123" as Id<"homeworkAssignments">, gameId = "game123456" as Id<"liveGames">;
function delivery(deadline = Date.now() + 60000) {
  const definition = emptyDefinition("Pinned quiz");
  definition.fields = [{ id: "q", type: "text", label: "Question", required: true }, { id: "file", type: "file", label: "Work", required: false }];
  return { assignmentId, attemptId: "attempt123", title: "Pinned homework", formId, versionId: "version123", version: 1, definition, deadline, attemptNumber: 1, attemptsRemaining: 1, serverTime: Date.now(), nextFieldReleaseAt: null };
}
beforeEach(() => {
  vi.clearAllMocks(); m.authenticated = true; m.progress = []; m.renderer = null;
  const definition = emptyDefinition("Quiz"); definition.quiz = { enabled: true };
  definition.fields = [{ id: "q", type: "choice", label: "Question", required: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }, { id: "n", type: "number", label: "Age", required: false }];
  m.snapshot = { _id: "version123", version: 1, definition };
  m.form = { title: "Quiz", role: "owner", publishedVersion: 1, versions: [{ version: 1 }], draft: definition };
  m.teams = [{ teamId: "team123", name: "Blue", members: 2, score: 10, rank: 1 }];
  m.matrix = { evidence: { version: 1, windowLimit: 500, windowLimited: false, minimumCell: 5 }, suppressed: false, cells: [{ segment: "en", comparison: "completed", count: 5, withinSegmentRate: 1 }] };
  m.start.mockResolvedValue("attempt123"); m.read.mockResolvedValue(delivery());
  m.submit.mockResolvedValue({ responseId: "response123", score: 2, maxScore: 2, duplicate: false });
  m.upload.mockResolvedValue("https://upload.test/forms/upload?ticket=owned"); m.getToken.mockResolvedValue("auth-token");
  m.create.mockResolvedValue(assignmentId); m.enroll.mockResolvedValue(null); m.close.mockResolvedValue(null); m.join.mockResolvedValue({ teamId: "team123" }); m.assign.mockResolvedValue("member123"); m.createTeam.mockResolvedValue("team123");
});
afterEach(() => vi.unstubAllGlobals());

describe("native homework delivery", () => {
  it("gates signed-out students and does not request private attempt data", () => {
    m.authenticated = false; render(<HomeworkStudent assignmentId={assignmentId} />);
    expect(screen.getByRole("button", { name: "Sign in to do your homework" })).toBeInTheDocument();
    expect(m.read).not.toHaveBeenCalled(); expect(m.query).not.toHaveBeenCalled();
  });
  it("renders the pinned definition and submits its attempt rather than the public form", async () => {
    render(<HomeworkStudent assignmentId={assignmentId} />);
    fireEvent.click(screen.getByRole("button", { name: "Start or resume attempt" }));
    expect(await screen.findByText("Pinned homework")).toBeInTheDocument();
    expect(m.start).toHaveBeenCalledWith({ assignmentId });
    expect(getFunctionName(m.read.mock.calls[0][0])).toBe("homework:getAttemptDefinition");
    expect(m.read.mock.calls[0][1]).toEqual({ attemptId: "attempt123" });
    fireEvent.change(screen.getByLabelText("Pinned answer"), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit homework" }));
    await screen.findByText("Homework submitted");
    expect(m.submit).toHaveBeenCalledWith({ attemptId: "attempt123", answers: { q: "a" }, language: "en" });
    expect(screen.getByText("Score: 2 / 2")).toBeInTheDocument();
  });
  it("sends authenticated file uploads to the attempt ticket and keeps only validated receipts", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ uploadId: "receipt123", name: "work.txt", size: 4 }) }); vi.stubGlobal("fetch", fetch);
    render(<HomeworkStudent assignmentId={assignmentId} />); fireEvent.click(screen.getByRole("button", { name: "Start or resume attempt" })); await screen.findByText("Pinned homework");
    const file = new File(["work"], "work.txt", { type: "text/plain" });
    let receipt: unknown;
    await act(async () => { receipt = await (m.renderer as FormRendererProps).uploadFile!({ id: "file", type: "file", label: "Work", required: true }, file); });
    expect(m.upload).toHaveBeenCalledWith({ attemptId: "attempt123", fieldId: "file" });
    expect(fetch).toHaveBeenCalledWith("https://upload.test/forms/upload?ticket=owned&name=work.txt", { method: "POST", headers: { "Content-Type": "text/plain", Authorization: "Bearer auth-token" }, body: file });
    expect(receipt).toEqual({ uploadId: "receipt123", name: "work.txt", size: 4 });
    await expect((m.renderer as FormRendererProps).uploadFile!({ id: "file", type: "file", label: "Work", required: true }, new File([], "empty.txt"))).rejects.toThrow("nonempty");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("locks expired attempts and reports revoked enrollment without submitting", async () => {
    m.read.mockResolvedValue(delivery(Date.now() - 1000));
    const view = render(<HomeworkStudent assignmentId={assignmentId} />); fireEvent.click(screen.getByRole("button", { name: "Start or resume attempt" }));
    await screen.findByText("The deadline has passed. Submissions and uploads are closed.");
    expect(screen.getByRole("button", { name: "Submit homework" }).closest("fieldset")).toBeDisabled(); expect(m.submit).not.toHaveBeenCalled();
    view.unmount(); m.start.mockRejectedValue(new Error("Active enrollment required")); render(<HomeworkStudent assignmentId={assignmentId} />); fireEvent.click(screen.getByRole("button", { name: "Start or resume attempt" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("active enrollment"); expect(m.submit).not.toHaveBeenCalled();
  });
  it("creates a pinned assignment and forwards enrollment to the native owner mutation", async () => {
    render(<HomeworkManager formId={formId} />);
    fireEvent.change(screen.getByLabelText("Opens"), { target: { value: "2099-01-01T12:00" } }); fireEvent.change(screen.getByLabelText("Deadline"), { target: { value: "2099-01-02T12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Create assignment" })); await screen.findByText("Assignment created. Enroll students before sharing the link.");
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ formId, versionId: "version123", title: "Quiz", maxAttempts: 1 }));
    expect(screen.getByRole("link", { name: "Student link" })).toHaveAttribute("href", `/homework/${assignmentId}`);
    fireEvent.change(screen.getByLabelText("Student account ID"), { target: { value: "student_registered" } }); fireEvent.click(screen.getByRole("button", { name: "Enroll student" }));
    await waitFor(() => expect(m.enroll).toHaveBeenCalledWith({ assignmentId, studentId: "student_registered", active: true }));
  });
});

describe("native live teams", () => {
  it("creates and assigns teams only in the host lobby", async () => {
    const view = render(<TeamPanel gameId={gameId} frozen={false} maxPlayers={10} players={[{ _id: "player123" as Id<"livePlayers">, nickname: "Alex" }]} />);
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "Green" } }); fireEvent.click(screen.getByRole("button", { name: "Create team" }));
    await screen.findByText("Team created."); expect(m.createTeam).toHaveBeenCalledWith({ gameId, name: "Green", maxMembers: 5 });
    fireEvent.change(screen.getByLabelText("Team"), { target: { value: "team123" } }); fireEvent.click(screen.getByRole("button", { name: "Assign player" }));
    await screen.findByText("Player assigned."); expect(m.assign).toHaveBeenCalledWith({ gameId, playerId: "player123", teamId: "team123" });
    view.rerender(<TeamPanel gameId={gameId} frozen maxPlayers={10} players={[]} />);
    expect(screen.queryByRole("button", { name: "Create team" })).toBeNull(); expect(screen.getByText("Blue")).toBeInTheDocument();
  });
  it("uses the existing player token and displays a full-team error", async () => {
    m.join.mockRejectedValue(new Error("LIVE_TEAM_FULL")); render(<TeamPanel gameId={gameId} token="player-token" frozen={false} />);
    fireEvent.change(screen.getByLabelText("Team"), { target: { value: "team123" } }); fireEvent.click(screen.getByRole("button", { name: "Join team" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("team is full"); expect(m.join).toHaveBeenCalledWith({ gameId, token: "player-token", teamId: "team123" });
    expect(m.query).toHaveBeenCalledWith("liveTeams:standings", { gameId, token: "player-token" }); expect(m.createTeam).not.toHaveBeenCalled();
  });
});

describe("native version-specific segments", () => {
  it("preserves typed boolean values and respects whole-matrix suppression", () => {
    m.matrix = { evidence: { version: 1, windowLimit: 500, windowLimited: true, minimumCell: 5 }, suppressed: true, cells: [{ segment: "secret-small-cell", comparison: "completed", count: 1, withinSegmentRate: 1 }] };
    render(<Segments formId={formId} versions={[{ version: 1 }]} publishedVersion={1} parameters={[{ name: "consent", type: "boolean" }]} />);
    expect(screen.getByText(/Results are withheld/)).toBeInTheDocument(); expect(screen.queryByRole("table")).toBeNull(); expect(screen.queryByText("secret-small-cell")).toBeNull();
    fireEvent.change(screen.getByLabelText("Segment by"), { target: { value: "hidden_parameter:consent" } }); fireEvent.change(screen.getByLabelText("Values (one per line)"), { target: { value: "false\ntrue" } }); fireEvent.click(screen.getByRole("button", { name: "Compare segments" }));
    expect(m.query).toHaveBeenLastCalledWith("formSegmentAnalysis:crossTab", { formId, version: 1, segment: { kind: "hidden_parameter", name: "consent", values: [false, true] }, compare: { kind: "status" } });
    expect(m.query.mock.calls.some(([name]) => name === "formSegmentAnalysis:funnel")).toBe(false);
  });
  it("uses published snapshots and validates numeric bins before querying", () => {
    render(<Segments formId={formId} versions={[{ version: 1 }, { version: 2 }]} publishedVersion={1} parameters={[]} />);
    fireEvent.change(screen.getByLabelText("Published version"), { target: { value: "2" } }); expect(m.query).toHaveBeenCalledWith("forms:getVersion", { formId, version: 2 });
    fireEvent.change(screen.getByLabelText("Segment by"), { target: { value: "number:n" } }); fireEvent.change(screen.getByLabelText("Numeric cutoffs (comma separated)"), { target: { value: "20,10" } }); fireEvent.click(screen.getByRole("button", { name: "Compare segments" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Check the cutoffs");
    expect(m.query.mock.calls.some(([, args]) => args?.segment?.kind === "number")).toBe(false);
  });
});
