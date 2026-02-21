"use client";

import { useEffect, useState } from "react";

type PendingUser = {
  id: string;
  userId: string;
  email: string;
  username: string;
  role: "PLAYER" | "SUPPORTER";
  createdAt: string;
};

type MemberRole = "LEADER" | "PLAYER" | "SUPPORTER";
type MemberStatus = "PENDING_ADMIN" | "PENDING_LEADER" | "APPROVED" | "REJECTED";

type MemberRow = {
  membershipId: string;
  role: MemberRole;
  status: MemberStatus;
  createdAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    name: string | null;
    imageUrl: string | null;
    position?: string | null;
    birthDate?: string | null;
    phoneNumber?: string | null;
  };
};

type JsonDocumentScope = "TEAM" | "PUBLIC";
type PlaybookDoc = {
  id: string;
  scope: JsonDocumentScope;
  teamId: string | null;
  title: string;
  createdAt: string;
};

type TestType = "BEEP";

type TeamTestListItem = {
  id: string;
  type: TestType;
  testDate: string;
  createdAt: string;
  updatedAt: string;
  participantsCount: number;
};

type TeamTestResultRow = {
  id: string;
  userId: string | null;
  externalName: string | null;
  resultText: string | null;
  user: {
    id: string;
    username: string;
    email: string;
    name: string | null;
    imageUrl: string | null;
  } | null;
};

type TeamTestDetail = {
  id: string;
  type: TestType;
  testDate: string;
  createdAt: string;
  updatedAt: string;
  results: TeamTestResultRow[];
};

export default function LeaderPage() {
  const SHOW_PLAYBOOK = false;
  type TabKey = "members" | "matches" | "playbook" | "tests";
  const [tab, setTab] = useState<TabKey>("members");

  const [pending, setPending] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [matches, setMatches] = useState<
    {
      id: string;
      title: string;
      videoUrl: string;
      matchDate: string;
      createdAt: string;
    }[]
  >([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editMember, setEditMember] = useState<MemberRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [playbooks, setPlaybooks] = useState<PlaybookDoc[]>([]);
  const [playbooksLoading, setPlaybooksLoading] = useState(false);
  const [playbooksError, setPlaybooksError] = useState<string | null>(null);

  const [tests, setTests] = useState<TeamTestListItem[]>([]);
  const [testsLoading, setTestsLoading] = useState(false);
  const [testsError, setTestsError] = useState<string | null>(null);

  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testMode, setTestMode] = useState<"CREATE" | "EDIT">("CREATE");
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [testType, setTestType] = useState<TestType>("BEEP");
  const [testDate, setTestDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [participantUserIds, setParticipantUserIds] = useState<string[]>([]);
  const [resultTextByUserId, setResultTextByUserId] = useState<Record<string, string>>({});
  const [participantNames, setParticipantNames] = useState<string[]>([]);
  const [resultTextByExternalName, setResultTextByExternalName] = useState<Record<string, string>>({});
  const [resultRowIdByUserId, setResultRowIdByUserId] = useState<Record<string, string>>({});
  const [resultRowIdByExternalName, setResultRowIdByExternalName] = useState<Record<string, string>>({});
  const [testBusy, setTestBusy] = useState(false);
  const [testModalError, setTestModalError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newDate, setNewDate] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/leader/pending");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? "Kunne ikke hente afventende brugere.");
        setPending([]);
        return;
      }

      setPending(data?.memberships ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function loadMembers() {
    setMembersLoading(true);
    setMembersError(null);

    try {
      const res = await fetch("/api/leader/members", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMembersError(data?.message ?? "Kunne ikke hente medlemmer.");
        setMembers([]);
        return;
      }

      const rows = Array.isArray(data?.members) ? (data.members as MemberRow[]) : [];
      rows.sort((a, b) => {
        const roleRank = (r: MemberRole) => (r === "LEADER" ? 0 : r === "PLAYER" ? 1 : 2);
        const rr = roleRank(a.role) - roleRank(b.role);
        if (rr !== 0) return rr;
        const an = (a.user.name ?? a.user.username ?? "").toLowerCase();
        const bn = (b.user.name ?? b.user.username ?? "").toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        return 0;
      });
      setMembers(rows);
    } finally {
      setMembersLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadPlaybooks() {
    setPlaybooksLoading(true);
    setPlaybooksError(null);

    try {
      const res = await fetch("/api/json-documents?kind=PLAYBOOK", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlaybooksError(data?.message ?? "Kunne ikke hente playbooks.");
        setPlaybooks([]);
        return;
      }
      setPlaybooks(Array.isArray(data?.documents) ? (data.documents as PlaybookDoc[]) : []);
    } finally {
      setPlaybooksLoading(false);
    }
  }

  useEffect(() => {
    loadPlaybooks();
  }, []);

  async function loadTests() {
    setTestsLoading(true);
    setTestsError(null);

    try {
      const res = await fetch("/api/leader/tests", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestsError(data?.message ?? "Kunne ikke hente tests.");
        setTests([]);
        return;
      }

      setTests(Array.isArray(data?.tests) ? (data.tests as TeamTestListItem[]) : []);
    } finally {
      setTestsLoading(false);
    }
  }

  useEffect(() => {
    loadTests();
  }, []);

  async function loadMatches() {
    setMatchesLoading(true);
    setMatchesError(null);

    try {
      const res = await fetch("/api/leader/matches", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMatchesError(data?.message ?? "Kunne ikke hente kampe.");
        setMatches([]);
        return;
      }
      setMatches(data?.matches ?? []);
    } finally {
      setMatchesLoading(false);
    }
  }

  useEffect(() => {
    loadMatches();
  }, []);

  const approvedPlayers = members
    .filter((m) => m.role === "PLAYER" && m.status === "APPROVED")
    .map((m) => ({
      userId: m.user.id,
      displayName: (m.user.name ?? m.user.username).trim(),
      email: m.user.email,
      imageUrl: m.user.imageUrl,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "da-DK"));

  function openCreateTest() {
    setTestModalError(null);
    setTestMode("CREATE");
    setActiveTestId(null);
    setTestType("BEEP");
    setTestDate(new Date().toISOString().slice(0, 10));
    setParticipantUserIds([]);
    setResultTextByUserId({});
    setParticipantNames([]);
    setResultTextByExternalName({});
    setResultRowIdByUserId({});
    setResultRowIdByExternalName({});
    setTestModalOpen(true);
  }

  async function openEditTest(testId: string) {
    setTestModalError(null);
    setTestMode("EDIT");
    setActiveTestId(testId);
    setTestModalOpen(true);

    setTestBusy(true);
    try {
      const res = await fetch(`/api/leader/tests/${testId}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestModalError(data?.message ?? "Kunne ikke hente test.");
        return;
      }

      const test = data?.test as TeamTestDetail | undefined;
      if (!test) {
        setTestModalError("Kunne ikke hente test.");
        return;
      }

      setTestType(test.type);
      setTestDate(new Date(test.testDate).toISOString().slice(0, 10));
      const userRows = test.results.filter((r) => r.userId);
      const externalRows = test.results.filter((r) => r.externalName);

      setParticipantUserIds(userRows.map((r) => r.userId as string));
      setParticipantNames(externalRows.map((r) => (r.externalName as string).trim()));
      setResultTextByUserId(Object.fromEntries(userRows.map((r) => [r.userId as string, r.resultText ?? ""])));
      setResultTextByExternalName(
        Object.fromEntries(externalRows.map((r) => [(r.externalName as string).trim(), r.resultText ?? ""]))
      );
      setResultRowIdByUserId(Object.fromEntries(userRows.map((r) => [r.userId as string, r.id])));
      setResultRowIdByExternalName(
        Object.fromEntries(externalRows.map((r) => [(r.externalName as string).trim(), r.id]))
      );
    } finally {
      setTestBusy(false);
    }
  }

  function setAllPlayersAsParticipants() {
    const all = approvedPlayers.map((p) => p.userId);
    setParticipantUserIds(all);
    setResultTextByUserId((prev) => {
      const next = { ...prev };
      for (const id of all) if (next[id] === undefined) next[id] = "";
      return next;
    });
  }

  function toggleParticipant(userId: string) {
    setParticipantUserIds((prev) => {
      const exists = prev.includes(userId);
      const next = exists ? prev.filter((id) => id !== userId) : [...prev, userId];
      setResultTextByUserId((prevResults) => {
        const nextResults = { ...prevResults };
        if (!exists && nextResults[userId] === undefined) nextResults[userId] = "";
        if (exists) delete nextResults[userId];
        return nextResults;
      });
      return next;
    });
  }

  function normalizeExternalName(raw: string) {
    return raw.trim().replace(/\s+/g, " ");
  }

  function addExternalParticipant(rawName: string, initialResultText?: string) {
    const name = normalizeExternalName(rawName);
    if (!name) return;

    setParticipantNames((prev) => {
      const key = name.toLowerCase();
      const existingKeys = new Set(prev.map((n) => n.toLowerCase()));
      if (existingKeys.has(key)) return prev;
      return [...prev, name];
    });

    if (initialResultText !== undefined) {
      setResultTextByExternalName((prev) => ({ ...prev, [name]: initialResultText }));
    } else {
      setResultTextByExternalName((prev) => (prev[name] === undefined ? { ...prev, [name]: "" } : prev));
    }
  }

  function removeExternalParticipant(name: string) {
    setParticipantNames((prev) => prev.filter((n) => n !== name));
    setResultTextByExternalName((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setResultRowIdByExternalName((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function isValidBeepResultText(raw: string) {
    const t = raw.trim();
    if (!t) return true;
    return /^\d{2},\d{2}$/.test(t);
  }

  function validateAndBuildResultsPatch(forCreate: boolean) {
    const invalid: string[] = [];

    const userResults = participantUserIds.map((userId) => {
      const raw = (resultTextByUserId[userId] ?? "").trim();
      const valid = testType !== "BEEP" ? true : isValidBeepResultText(raw);
      if (!valid) invalid.push(userId);
      return {
        ...(forCreate ? {} : resultRowIdByUserId[userId] ? { id: resultRowIdByUserId[userId] } : {}),
        userId,
        resultText: valid ? raw : null,
      };
    });

    const externalResults = participantNames.map((externalName) => {
      const raw = (resultTextByExternalName[externalName] ?? "").trim();
      const valid = testType !== "BEEP" ? true : isValidBeepResultText(raw);
      if (!valid) invalid.push(externalName);
      return {
        ...(forCreate ? {} : resultRowIdByExternalName[externalName] ? { id: resultRowIdByExternalName[externalName] } : {}),
        externalName,
        resultText: valid ? raw : null,
      };
    });

    return { results: [...userResults, ...externalResults], invalidCount: invalid.length };
  }

  async function pasteParticipantsFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const raw = String(text ?? "");
      if (!raw.trim()) return;

      const playerByNameKey = new Map<string, { userId: string; displayName: string }>();
      for (const p of approvedPlayers) {
        playerByNameKey.set(p.displayName.trim().toLowerCase(), { userId: p.userId, displayName: p.displayName });
      }

      const lines = raw
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((l) => l.trimEnd());

      for (const line of lines) {
        const l = line.trim();
        if (!l) continue;

        const cells = l.includes("\t") ? l.split("\t") : l.includes(";") ? l.split(";") : [l];
        const nameCell = String(cells[0] ?? "");
        const resultCell = String(cells[1] ?? "");

        const name = normalizeExternalName(nameCell);
        if (!name) continue;

        const maybeUser = playerByNameKey.get(name.toLowerCase());
        if (maybeUser) {
          const userId = maybeUser.userId;
          setParticipantUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
          setResultTextByUserId((prev) => ({ ...prev, [userId]: resultCell.trim() ? resultCell.trim() : (prev[userId] ?? "") }));
          continue;
        }

        addExternalParticipant(name, resultCell.trim() ? resultCell.trim() : undefined);
      }
    } catch {
      setTestModalError("Kunne ikke læse clipboard. Prøv igen (kræver typisk HTTPS eller localhost). ");
    }
  }

  async function createTest() {
    if (testBusy) return;
    setTestModalError(null);

    if (!testDate) {
      setTestModalError("Dato mangler.");
      return;
    }
    if (participantUserIds.length + participantNames.length === 0) {
      setTestModalError("Vælg mindst én deltager.");
      return;
    }

    const built = validateAndBuildResultsPatch(true);
    if (testType === "BEEP" && built.invalidCount > 0) {
      setTestModalError("Nogle resultater var ugyldige og bliver ikke gemt. Format: ##,## (fx 09,07).");
    }

    setTestBusy(true);
    try {
      const res = await fetch("/api/leader/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: testType,
          testDate,
          participantUserIds,
          participantNames,
          results: built.results,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestModalError(data?.message ?? "Kunne ikke oprette test.");
        return;
      }

      const created = data?.test as TeamTestDetail | undefined;
      if (!created?.id) {
        setTestModalError("Kunne ikke oprette test.");
        return;
      }

      setTestMode("EDIT");
      setActiveTestId(created.id);
      setTestType(created.type);
      setTestDate(new Date(created.testDate).toISOString().slice(0, 10));
      const userRows = created.results.filter((r) => r.userId);
      const externalRows = created.results.filter((r) => r.externalName);
      setParticipantUserIds(userRows.map((r) => r.userId as string));
      setParticipantNames(externalRows.map((r) => (r.externalName as string).trim()));
      setResultTextByUserId(Object.fromEntries(userRows.map((r) => [r.userId as string, r.resultText ?? ""])));
      setResultTextByExternalName(
        Object.fromEntries(externalRows.map((r) => [(r.externalName as string).trim(), r.resultText ?? ""]))
      );
      setResultRowIdByUserId(Object.fromEntries(userRows.map((r) => [r.userId as string, r.id])));
      setResultRowIdByExternalName(
        Object.fromEntries(externalRows.map((r) => [(r.externalName as string).trim(), r.id]))
      );
      await loadTests();
    } finally {
      setTestBusy(false);
    }
  }

  async function saveTestChanges() {
    if (!activeTestId) return;
    if (testBusy) return;
    setTestModalError(null);

    if (!testDate) {
      setTestModalError("Dato mangler.");
      return;
    }
    if (participantUserIds.length + participantNames.length === 0) {
      setTestModalError("Vælg mindst én deltager.");
      return;
    }

    setTestBusy(true);
    try {
      const built = validateAndBuildResultsPatch(false);
      if (testType === "BEEP" && built.invalidCount > 0) {
        setTestModalError("Nogle resultater var ugyldige og bliver ikke gemt. Format: ##,## (fx 09,07).");
      }

      const res = await fetch(`/api/leader/tests/${activeTestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: testType,
          testDate,
          participantUserIds,
          participantNames,
          results: built.results,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestModalError(data?.message ?? "Kunne ikke gemme test.");
        return;
      }

      const updated = data?.test as TeamTestDetail | undefined;
      if (updated) {
        setTestType(updated.type);
        setTestDate(new Date(updated.testDate).toISOString().slice(0, 10));
        const userRows = updated.results.filter((r) => r.userId);
        const externalRows = updated.results.filter((r) => r.externalName);
        setParticipantUserIds(userRows.map((r) => r.userId as string));
        setParticipantNames(externalRows.map((r) => (r.externalName as string).trim()));
        setResultTextByUserId(Object.fromEntries(userRows.map((r) => [r.userId as string, r.resultText ?? ""])));
        setResultTextByExternalName(
          Object.fromEntries(externalRows.map((r) => [(r.externalName as string).trim(), r.resultText ?? ""]))
        );
        setResultRowIdByUserId(Object.fromEntries(userRows.map((r) => [r.userId as string, r.id])));
        setResultRowIdByExternalName(
          Object.fromEntries(externalRows.map((r) => [(r.externalName as string).trim(), r.id]))
        );
      }

      await loadTests();
    } finally {
      setTestBusy(false);
    }
  }

  async function deleteTest(testId: string) {
    const ok = window.confirm("Slet testen?\nDette kan ikke fortrydes.");
    if (!ok) return;

    setTestsError(null);
    const res = await fetch(`/api/leader/tests/${testId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTestsError(data?.message ?? "Kunne ikke slette test.");
      return;
    }

    if (activeTestId === testId) {
      setTestModalOpen(false);
      setActiveTestId(null);
    }
    await loadTests();
  }

  function testTypeLabel(t: TestType) {
    if (t === "BEEP") return "Beep Test";
    return t;
  }

  async function approve(membershipId: string, approve: boolean) {
    const res = await fetch("/api/leader/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membershipId, approve }),
    });

    if (res.ok) await load();
    else {
      const data = await res.json().catch(() => ({}));
      setError(data?.message ?? "Kunne ikke opdatere bruger.");
    }
  }

  function openEdit(m: MemberRow) {
    setEditError(null);
    setEditMember(m);
    setEditName(m.user.name ?? "");
    setEditImageUrl(m.user.imageUrl ?? "");
    setEditPosition((m.user.position ?? "") as string);
    const bd = String(m.user.birthDate ?? "").trim();
    setEditBirthDate(bd ? new Date(bd).toISOString().slice(0, 10) : "");
    setEditPhoneNumber((m.user.phoneNumber ?? "") as string);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editMember) return;
    if (editBusy) return;
    setEditBusy(true);
    setEditError(null);

    try {
      const res = await fetch("/api/leader/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: editMember.user.id,
          name: editName,
          imageUrl: editImageUrl,
          position: editPosition,
          birthDate: editBirthDate,
          phoneNumber: editPhoneNumber,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(data?.message ?? "Kunne ikke gemme ændringer.");
        return;
      }

      setEditOpen(false);
      setEditMember(null);
      await loadMembers();
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteMember(membershipId: string) {
    const ok = window.confirm("Slet medlemmet fra holdet?");
    if (!ok) return;

    setMembersError(null);
    const res = await fetch("/api/leader/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membershipId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMembersError(data?.message ?? "Kunne ikke slette medlem.");
      return;
    }
    await Promise.all([loadMembers(), load()]);
  }

  async function createMatch(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    const videoUrl = newUrl.trim();
    const matchDate = newDate.trim();
    if (!title || !videoUrl || !matchDate) return;

    setCreating(true);
    setMatchesError(null);
    try {
      const res = await fetch("/api/leader/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, videoUrl, matchDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMatchesError(data?.message ?? "Kunne ikke oprette kamp.");
        return;
      }
      setNewTitle("");
      setNewUrl("");
      setNewDate("");
      await loadMatches();
    } finally {
      setCreating(false);
    }
  }

  async function deleteMatch(matchId: string) {
    const ok = window.confirm("Slet kampen?");
    if (!ok) return;

    setMatchesError(null);
    const res = await fetch("/api/leader/matches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMatchesError(data?.message ?? "Kunne ikke slette kamp.");
      return;
    }
    await loadMatches();
  }

  return (
    <main className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">Leder</h1>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("members")}
          className={
            "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold " +
            (tab === "members" ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white")
          }
        >
          Medlemmer
          {pending.length > 0 ? (
            <span className="inline-grid min-w-[20px] place-items-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-5 text-white">
              {pending.length}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => setTab("matches")}
          className={
            "rounded-md px-3 py-2 text-sm font-semibold " +
            (tab === "matches" ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white")
          }
        >
          Kampe
        </button>

        {SHOW_PLAYBOOK ? (
          <button
            type="button"
            onClick={() => setTab("playbook")}
            className={
              "rounded-md px-3 py-2 text-sm font-semibold " +
              (tab === "playbook" ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white")
            }
          >
            Playbook
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setTab("tests")}
          className={
            "rounded-md px-3 py-2 text-sm font-semibold " +
            (tab === "tests" ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white")
          }
        >
          Tests
        </button>
      </div>

      {tab === "members" ? (
        <div className="space-y-6">
          <section className="rounded-md border bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Afventende brugere</h2>
              <button
                type="button"
                onClick={load}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                disabled={loading}
              >
                Opdater
              </button>
            </div>

            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

            {pending.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">Ingen afventende brugere.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {pending.map((u) => (
                  <div
                    key={u.id}
                    className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="text-sm">
                      <div className="font-medium">{u.username}</div>
                      <div className="text-zinc-600">
                        {u.email} • {u.role === "PLAYER" ? "Spiller" : "Supporter"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => approve(u.id, true)}
                        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white"
                      >
                        Godkend
                      </button>
                      <button
                        type="button"
                        onClick={() => approve(u.id, false)}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                      >
                        Afvis
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-md border bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Medlemmer</h2>
              <button
                type="button"
                onClick={loadMembers}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                disabled={membersLoading}
              >
                Opdater
              </button>
            </div>

            <p className="mt-2 text-sm text-zinc-600">
              Her kan du tilføje Navn og Billede URL til alle brugere på holdet.
            </p>

            {membersError ? <p className="mt-2 text-sm text-red-600">{membersError}</p> : null}
            {membersLoading ? <p className="mt-3 text-sm text-zinc-600">Henter…</p> : null}

            {!membersLoading && members.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">Ingen medlemmer fundet.</p>
            ) : null}

            {members.length > 0 ? (
              <div className="mt-4 space-y-3">
                {members.map((m) => {
                  const canDelete = m.role === "PLAYER" || m.role === "SUPPORTER";
                  const roleLabel = m.role === "LEADER" ? "Leder" : m.role === "PLAYER" ? "Spiller" : "Supporter";
                  const displayName = (m.user.name ?? m.user.username).trim();

                  return (
                    <div
                      key={m.membershipId}
                      className="flex flex-col gap-3 rounded-md border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {m.user.imageUrl ? (
                          <img
                            src={m.user.imageUrl}
                            alt=""
                            className="h-10 w-10 rounded-md object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-md bg-zinc-100" />
                        )}
                        <div className="min-w-0 text-sm">
                          <div className="truncate font-medium">{displayName}</div>
                          <div className="truncate text-zinc-600">
                            {m.user.email} • {roleLabel}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:justify-end">
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                        >
                          Rediger
                        </button>

                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => deleteMember(m.membershipId)}
                            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700"
                          >
                            Slet
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {tab === "matches" ? (
      <section className="rounded-md border bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Kampe</h2>
          <button
            type="button"
            onClick={loadMatches}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
            disabled={matchesLoading}
          >
            Opdater
          </button>
        </div>

        <p className="mt-2 text-sm text-zinc-600">Tilføj en kamp (Titel + Video URL + Dato). Kampene kan afspilles under Kampe.</p>

        {matchesError ? <p className="mt-2 text-sm text-red-600">{matchesError}</p> : null}

        <form onSubmit={createMatch} className="mt-4 grid gap-2 sm:grid-cols-4">
          <input
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            placeholder="Titel"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />
          <input
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            placeholder="Video URL (YouTube)"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            required
          />
          <input
            type="date"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            required
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={creating}
          >
            {creating ? "Gemmer…" : "Tilføj"}
          </button>
        </form>

        {matchesLoading ? <p className="mt-3 text-sm text-zinc-600">Henter…</p> : null}

        {matches.length === 0 && !matchesLoading ? (
          <p className="mt-4 text-sm text-zinc-600">Ingen kampe endnu.</p>
        ) : null}

        {matches.length > 0 ? (
          <div className="mt-4 space-y-2">
            {matches.map((m) => (
              <div key={m.id} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{m.title}</div>
                  <div className="truncate text-xs text-zinc-600">{m.videoUrl}</div>
                  <div className="mt-0.5 text-xs text-zinc-600">Dato: {new Date(m.matchDate).toLocaleDateString("da-DK")}</div>
                </div>
                <div className="flex gap-2">
                  <a
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                    href="/kampe"
                  >
                    Afspil
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteMatch(m.id)}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                  >
                    Slet
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      ) : null}

      {SHOW_PLAYBOOK && tab === "playbook" ? (
        <section className="rounded-md border bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Playbook</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadPlaybooks}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                disabled={playbooksLoading}
              >
                Opdater
              </button>
              <a
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white"
                href="/playbook"
              >
                Åbn Playbook
              </a>
            </div>
          </div>

          <p className="mt-2 text-sm text-zinc-600">
            Her vises de seneste playbooks (TEAM + PUBLIC) du har adgang til.
          </p>

          {playbooksError ? <p className="mt-2 text-sm text-red-600">{playbooksError}</p> : null}
          {playbooksLoading ? <p className="mt-3 text-sm text-zinc-600">Henter…</p> : null}

          {!playbooksLoading && playbooks.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">Ingen playbooks endnu.</p>
          ) : null}

          {playbooks.length > 0 ? (
            <div className="mt-4 space-y-2">
              {playbooks.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{d.title}</div>
                    <div className="text-xs text-zinc-600">
                      {d.scope === "PUBLIC" ? "Offentlig" : "Hold"} • {new Date(d.createdAt).toLocaleDateString("da-DK")}
                    </div>
                  </div>
                  <a className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm" href="/playbook">
                    Åbn
                  </a>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "tests" ? (
        <div className="space-y-6">
          <section className="rounded-md border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Tests</h2>
                
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={loadTests}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  disabled={testsLoading}
                >
                  Opdater
                </button>
                <button
                  type="button"
                  onClick={openCreateTest}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
                >
                  Opret Test
                </button>
              </div>
            </div>

            {testsError ? <p className="mt-3 text-sm text-red-600">{testsError}</p> : null}
          </section>

          <section className="rounded-md border bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">Tidligere Tests</h3>
              {testsLoading ? <div className="text-sm text-zinc-600">Henter…</div> : null}
            </div>

            {tests.length === 0 && !testsLoading ? (
              <p className="mt-3 text-sm text-zinc-600">Ingen tests endnu.</p>
            ) : null}

            {tests.length > 0 ? (
              <div className="mt-4 space-y-2">
                {tests.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{testTypeLabel(t.type)}</div>
                      <div className="text-xs text-zinc-600">
                        {new Date(t.testDate).toLocaleDateString("da-DK")} • Deltagere: {t.participantsCount}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEditTest(t.id)}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                      >
                        Rediger
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTest(t.id)}
                        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700"
                      >
                        Slet
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {testModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !testBusy) setTestModalOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
              <div className="text-sm font-semibold">
                {testMode === "CREATE" ? "Opret Test" : "Rediger Test"}
              </div>
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                disabled={testBusy}
              >
                Luk
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {testModalError ? <p className="text-sm text-red-600">{testModalError}</p> : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                  <div className="text-xs font-semibold text-zinc-700">Test</div>
                  <select
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={testType}
                    onChange={(e) => setTestType(e.target.value as TestType)}
                    disabled={testBusy}
                  >
                    <option value="BEEP">Beep Test</option>
                  </select>
                </label>

                <label className="block sm:col-span-2">
                  <div className="text-xs font-semibold text-zinc-700">Dato</div>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={testDate}
                    onChange={(e) => setTestDate(e.target.value)}
                    disabled={testBusy}
                  />
                </label>
              </div>

              <div className="rounded-md border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">Deltagere</div>
                    
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={setAllPlayersAsParticipants}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                      disabled={testBusy || approvedPlayers.length === 0}
                    >
                      Tilføj alle spillere
                    </button>
                            <button
                              type="button"
                              onClick={() => {
                                const name = window.prompt("Navn på spiller (ikke-medlem)");
                                if (name) addExternalParticipant(name);
                              }}
                              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                              disabled={testBusy}
                            >
                              Tilføj spiller
                            </button>
                            <button
                              type="button"
                              onClick={pasteParticipantsFromClipboard}
                              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                              disabled={testBusy}
                              title="Kopier fra Excel og indsæt her (Navn [tab] Resultat)"
                            >
                              Indsæt
                            </button>
                    <button
                      type="button"
                      onClick={() => {
                        setParticipantUserIds([]);
                        setResultTextByUserId({});
                                setParticipantNames([]);
                                setResultTextByExternalName({});
                      }}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                      disabled={testBusy}
                    >
                      Ryd
                    </button>
                  </div>
                </div>

                {approvedPlayers.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-600">Der er ingen godkendte spillere på holdet.</p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {approvedPlayers.map((p) => {
                      const checked = participantUserIds.includes(p.userId);
                      return (
                        <label key={p.userId} className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleParticipant(p.userId)}
                            disabled={testBusy}
                          />
                          <span className="min-w-0 truncate">{p.displayName}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {participantNames.length > 0 ? (
                  <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-xs font-semibold text-zinc-700">Ikke-medlemmer</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {participantNames
                        .slice()
                        .sort((a, b) => a.localeCompare(b, "da-DK"))
                        .map((name) => (
                          <span key={name} className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm">
                            <span className="max-w-[220px] truncate">{name}</span>
                            <button
                              type="button"
                              onClick={() => removeExternalParticipant(name)}
                              className="rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-xs"
                              disabled={testBusy}
                            >
                              Fjern
                            </button>
                          </span>
                        ))}
                    </div>
                    <div className="mt-2 text-xs text-zinc-600">Tip: I Excel kan du kopiere kolonnerne “Navn” og evt. “Resultat”, og trykke “Indsæt”.</div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-md border border-zinc-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">Resultater</div>
                    <div className="mt-0.5 text-xs text-zinc-600">Gem som tekst (fx 09,07).</div>
                  </div>
                  <div className="text-xs text-zinc-600">Deltagere: {participantUserIds.length + participantNames.length}</div>
                </div>

                {participantUserIds.length + participantNames.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-600">Vælg deltagere for at indtaste resultater.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {[
                      ...participantUserIds.map((userId) => {
                        const p = approvedPlayers.find((x) => x.userId === userId);
                        return {
                          kind: "USER" as const,
                          key: `u:${userId}`,
                          label: p?.displayName ?? userId,
                          email: p?.email ?? null,
                          userId,
                        };
                      }),
                      ...participantNames.map((name) => ({
                        kind: "EXTERNAL" as const,
                        key: `e:${name}`,
                        label: name,
                        email: null,
                        externalName: name,
                      })),
                    ]
                      .sort((a, b) => a.label.localeCompare(b.label, "da-DK"))
                      .map((row) => {
                        const isUser = row.kind === "USER";
                        const label = row.label;
                        const email = row.email;

                        const value = isUser
                          ? resultTextByUserId[row.userId]
                          : resultTextByExternalName[row.externalName];

                        const isInvalid =
                          testType === "BEEP" &&
                          String(value ?? "").trim().length > 0 &&
                          !isValidBeepResultText(String(value ?? ""));

                        const onChange = (next: string) => {
                          if (isUser) setResultTextByUserId((prev) => ({ ...prev, [row.userId]: next }));
                          else setResultTextByExternalName((prev) => ({ ...prev, [row.externalName]: next }));
                        };

                        const onRemove = () => {
                          if (isUser) toggleParticipant(row.userId);
                          else removeExternalParticipant(row.externalName);
                        };

                        return (
                          <div key={row.key} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 text-sm">
                              <div className="truncate font-medium">{label}</div>
                              {email ? <div className="truncate text-xs text-zinc-600">{email}</div> : null}
                              {!isUser ? <div className="mt-0.5 text-xs text-zinc-500">Ikke-medlem</div> : null}
                              {isInvalid ? (
                                <div className="mt-0.5 text-xs text-red-600">Ugyldigt format. Brug ##,## (fx 09,07).</div>
                              ) : null}
                            </div>
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                              <input
                                type="text"
                                className={`w-full rounded-md border bg-white px-3 py-2 text-sm sm:w-56 ${
                                  isInvalid ? "border-red-400" : "border-zinc-300"
                                }`}
                                placeholder="Resultat (fx 09,07)"
                                value={value ?? ""}
                                onChange={(e) => onChange(e.target.value)}
                                disabled={testBusy}
                              />
                              <button
                                type="button"
                                onClick={onRemove}
                                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                                disabled={testBusy}
                              >
                                Fjern
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                disabled={testBusy}
              >
                Annuller
              </button>

              {testMode === "CREATE" ? (
                <button
                  type="button"
                  onClick={createTest}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={testBusy}
                >
                  {testBusy ? "Opretter…" : "Opret"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={saveTestChanges}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={testBusy || !activeTestId}
                >
                  {testBusy ? "Gemmer…" : "Gem"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {editOpen && editMember ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !editBusy) setEditOpen(false);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
              <div className="text-sm font-semibold">Rediger medlem</div>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                disabled={editBusy}
              >
                Luk
              </button>
            </div>

            <div className="space-y-3 p-4 text-sm">
              {editError ? <p className="text-sm text-red-600">{editError}</p> : null}

              <div className="text-xs text-zinc-600">
                {editMember.user.email} • {editMember.user.username}
              </div>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Navn</div>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <div className="text-xs font-semibold text-zinc-700">Position</div>
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={editPosition}
                    onChange={(e) => setEditPosition(e.target.value)}
                    placeholder="Fx Center"
                  />
                </label>

                <label className="block">
                  <div className="text-xs font-semibold text-zinc-700">Fødselsdato</div>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={editBirthDate}
                    onChange={(e) => setEditBirthDate(e.target.value)}
                  />
                </label>
              </div>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Telefonnummer</div>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={editPhoneNumber}
                  onChange={(e) => setEditPhoneNumber(e.target.value)}
                  placeholder="Fx +45 12 34 56 78"
                />
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-700">Billede URL</div>
                <input
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={editImageUrl}
                  onChange={(e) => setEditImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  disabled={editBusy}
                >
                  Annuller
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={editBusy}
                >
                  {editBusy ? "Gemmer…" : "Gem"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
