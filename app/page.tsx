"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Layers3,
  LoaderCircle,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
  Plus,
  RefreshCw,
  CircleHelp,
  CalendarDays,
  Inbox,
  CircleAlert,
  CheckCircle2,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  DEFAULT_RULES,
  growth,
  snapshotEnd,
  type Company,
  type DocumentRecord,
  type Evidence,
  type Filing,
  type MarketData,
  type Rules,
} from "../lib/domain";
import reviewedData from "../data/reviewed-analyses.json";
import {
  FinancialAnalysis,
  ResultsTable,
} from "../components/financial-analysis";
import type { FinancialResults, ReviewedAnalysis } from "../lib/financials";
import prepared from "../data/analysis.json";
import type { Job, SourceRun, Alert } from "../lib/services";
import type { Synthesis } from "../lib/model";
import { ResearchAnswer } from "../components/research-answer";
import { CallComparison } from "../components/call-comparison";
import { StructuredAnswer } from "../components/structured-answer";
import type {
  StructuredAnswer as StructuredResult,
  QuestionPlan,
} from "../lib/question-plan";
import { CompanyOverview } from "../components/company-overview";
import { QuarterChanges } from "../components/quarter-changes";
import type { CompanyPage } from "../lib/company-page";
type View = "today" | "research" | "portfolio";
const reviewed = reviewedData.companies as ReviewedAnalysis[];
type Dashboard = {
  jobs: Job[];
  portfolio: Company[];
  rules: Rules;
  events: Filing[];
  snapshotEvents: Filing[];
  markets: MarketData[];
  snapshotMarkets: MarketData[];
  runs: SourceRun[];
  alerts: Alert[];
  read: string[];
  snapshotAt: string;
  now: string;
};
type Research = {
  retrieval?: {
    mode: string;
    reason: string;
    indexed: number;
    eligible: number;
  };
  structured?: StructuredResult;
  plan?: QuestionPlan;
  results?: FinancialResults | null;
  model?: { configured: boolean; provider: string; model: string };
  synthesis?: Synthesis | null;
  modelError?: { code: string; message: string } | null;
  company: Company;
  documents: DocumentRecord[];
  evidence: Evidence[];
  message: string;
  coverage: { annualReports: number; transcripts: number; failed: number };
};
const api = async <T = unknown,>(path: string, body?: unknown) => {
  const r = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok)
    throw new Error(
      d && typeof d === "object" && "error" in d
        ? String(d.error)
        : "Request failed",
    );
  return d as T;
};
const date = (v: string, year = false) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" as const } : {}),
    timeZone: "Asia/Kolkata",
  }).format(new Date(v));
const time = (v: string) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(v));
const num = (v: number | null | undefined, d = 1) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      }).format(v);
const signed = (v: number | null) =>
  v === null ? "—" : `${v >= 0 ? "+" : ""}${num(v)}%`;
const headline = (e: Filing) =>
  e.description
    .replace(/^.*?has informed the Exchange (regarding|about)\s*/i, "")
    .replace(/^.*?has submitted to the Exchange,?\s*/i, "")
    .replace(/^['"]|['".]$/g, "")
    .replace(/^Announcement under Regulation 30 \(LODR\)-/, "");
const analysis = prepared;
function Source({
  url,
  label = "Open source",
  page,
}: {
  url: string;
  label?: string;
  page?: number;
}) {
  return (
    <a
      className="source-link"
      href={url + (page ? "#page=" + page : "")}
      target="_blank"
      rel="noreferrer"
    >
      {label}
      {page ? ` · p. ${page}` : ""}
      <ArrowUpRight size={14} />
    </a>
  );
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={28} />
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
function Spinner({ text }: { text: string }) {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={20} />
      {text}
    </div>
  );
}
function EvidenceCard({ item, index }: { item: Evidence; index: number }) {
  return (
    <article className="evidence-card">
      <div className="row spread">
        <span className="eyebrow">
          SOURCE {index + 1} · {item.type.replace("_", " ")}
        </span>
        <span className="small muted">p. {item.page}</span>
      </div>
      <p className="excerpt">
        {item.verbatim === false ? item.text : <>“{item.text}”</>}
      </p>
      <div className="row spread wrap">
        <span className="small muted">{item.title}</span>
        <Source url={item.url} page={item.page} />
      </div>
      <p className="date-note">
        {item.publishedAt
          ? `Published ${date(item.publishedAt, true)}`
          : "Publication date unverified; available only in current evidence search."}
      </p>
    </article>
  );
}

export default function Finn() {
  const [view, setView] = useState<View>("today"),
    [data, setData] = useState<Dashboard | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [windowDays, setWindowDays] = useState("1"),
    [mode, setMode] = useState<"snapshot" | "live">("live"),
    [from, setFrom] = useState("2026-11-01"),
    [to, setTo] = useState("2026-11-15"),
    [filter, setFilter] = useState("all"),
    [feedSearch, setFeedSearch] = useState(""),
    [routine, setRoutine] = useState(false);
  const [event, setEvent] = useState<Filing | null>(null),
    [eventEvidence, setEventEvidence] = useState<Evidence[]>([]),
    [showSettings, setShowSettings] = useState(false),
    [rules, setRules] = useState<Rules>(DEFAULT_RULES),
    [saving, setSaving] = useState(false);
  const [company, setCompany] = useState("INFY"),
    [companyPage, setCompanyPage] = useState<CompanyPage | null>(null),
    [query, setQuery] = useState(""),
    [matches, setMatches] = useState<Company[]>([]),
    [research, setResearch] = useState<Research | null>(null),
    [researchLoading, setResearchLoading] = useState(false),
    [tab, setTab] = useState<"ledger" | "changes" | "evidence" | "documents">(
      "ledger",
    ),
    [question, setQuestion] = useState(
      "business revenue growth guidance margins",
    ),
    [questionInput, setQuestionInput] = useState("");
  const [job, setJob] = useState<Job | null>(null),
    [addQuery, setAddQuery] = useState(""),
    [addMatches, setAddMatches] = useState<Company[]>([]),
    [ledgerSource, setLedgerSource] = useState<Evidence[] | null>(null);
  const [asOf, setAsOf] = useState(""),
    [answerMode, setAnswerMode] = useState(false),
    [answerRequest, setAnswerRequest] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const researchVersion = useRef(0),
    eventVersion = useRef(0),
    jobRunning = useRef(false);
  const [routeReady, setRouteReady] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = await api<Dashboard>("dashboard");
      setData(d);
      setRules(d.rules);
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }, []);
  useEffect(() => {
    const restore = () => {
      const p = new URLSearchParams(window.location.search);
      const v = p.get("view");
      if (v === "today" || v === "research" || v === "portfolio") setView(v);
      const c = p.get("company");
      if (c && /^[A-Z0-9&-]{1,24}$/.test(c)) setCompany(c);
      const t = p.get("tab");
      if (
        t === "ledger" ||
        t === "changes" ||
        t === "evidence" ||
        t === "documents"
      )
        setTab(t);
      const q = p.get("q");
      if (q) {
        setQuestion(q.slice(0, 500));
        setQuestionInput(q.slice(0, 500));
      }
      const d = p.get("asOf");
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setAsOf(d);
      setAnswerMode(false);
      setRouteReady(true);
    };
    const start = setTimeout(() => {
      void load();
      restore();
    }, 0);
    window.addEventListener("popstate", restore);
    return () => {
      clearTimeout(start);
      window.removeEventListener("popstate", restore);
    };
  }, [load]);
  useEffect(() => {
    if (!routeReady) return;
    const p = new URLSearchParams({ view });
    if (view === "research") {
      p.set("company", company);
      p.set("tab", tab);
      if (questionInput) p.set("q", questionInput);
      if (asOf) p.set("asOf", asOf);
    }
    window.history.replaceState(null, "", "?" + p);
  }, [routeReady, view, company, tab, questionInput, asOf]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    let active = true;
    if (!query.trim()) return;
    const id = setTimeout(() => {
      api<Company[]>("companies?q=" + encodeURIComponent(query))
        .then((r) => {
          if (active) setMatches(r);
        })
        .catch((e) =>
          setError(e instanceof Error ? e.message : "Request failed"),
        );
    }, 180);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [query]);
  useEffect(() => {
    let active = true;
    if (!addQuery.trim()) return;
    const id = setTimeout(() => {
      api<Company[]>("companies?q=" + encodeURIComponent(addQuery))
        .then((r) => {
          if (active) setAddMatches(r);
        })
        .catch((e) =>
          setError(e instanceof Error ? e.message : "Request failed"),
        );
    }, 180);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [addQuery]);
  useEffect(() => {
    if (view !== "research") return;
    const version = ++researchVersion.current;
    const loading = setTimeout(() => setResearchLoading(true), 0);
    (answerMode
      ? api<Research>("answer", {
          symbol: company,
          question,
          ...(asOf ? { asOf: asOf + "T23:59:59+05:30" } : {}),
        })
      : api<Research>(
          `research?symbol=${encodeURIComponent(company)}&q=${encodeURIComponent(question)}${asOf ? "&asOf=" + encodeURIComponent(asOf + "T23:59:59+05:30") : ""}`,
        )
    )
      .then((r) => {
        if (version === researchVersion.current) setResearch(r);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Request failed"))
      .finally(() => {
        clearTimeout(loading);
        if (version === researchVersion.current) setResearchLoading(false);
      });
    return () => {
      clearTimeout(loading);
      researchVersion.current = version + 1;
    };
  }, [view, company, question, asOf, answerMode, answerRequest]);
  const modalOpen = !!event || showSettings || !!ledgerSource;
  useEffect(() => {
    if (modalOpen && !dialog.current?.open) dialog.current?.showModal();
    else if (!modalOpen && dialog.current?.open) dialog.current?.close();
  }, [modalOpen]);
  const close = () => {
    eventVersion.current++;
    setEvent(null);
    setShowSettings(false);
    setLedgerSource(null);
  };
  const ask = (q: string) => {
    setQuestionInput(q);
    setQuestion(q);
    setAnswerMode(true);
    setAnswerRequest((n) => n + 1);
  };
  const investigate = (symbol: string) => {
    setAnswerMode(false);
    setCompany(symbol);
    setView("research");
    setQuery("");
    setTab(
      symbol === "INFY" || reviewed.some((a) => a.symbol === symbol)
        ? "ledger"
        : "evidence",
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const advanceJob = useCallback(
    async (initial: Job) => {
      if (jobRunning.current) return;
      jobRunning.current = true;
      try {
        let j = initial;
        setJob(j);
        let steps = 0;
        while (j.status === "running" && steps++ < 40) {
          j = await api<Job>(`jobs/${j.id}`);
          setJob(j);
          if (j.status === "running")
            await new Promise((r) => setTimeout(r, 2000));
        }
        await load();
        setAnswerMode(false);
        setAnswerRequest((n) => n + 1);
        setNotice(
          j.status === "complete"
            ? "Sources refreshed."
            : "Progress saved. Review source gaps or resume the job.",
        );
        if (j.symbol) {
          const result = await api<{ page: CompanyPage }>(
            `company-page?symbol=${encodeURIComponent(j.symbol)}`,
          );
          setCompanyPage(result.page);
        }
      } catch (e: unknown) {
        setError(
          e instanceof Error
            ? e.message
            : "Refresh interrupted. Reload to resume.",
        );
      } finally {
        jobRunning.current = false;
      }
    },
    [load],
  );
  const runJob = async (type: "research" | "refresh" | "filing") => {
    try {
      const j = await api<Job>(
        type,
        type === "research"
          ? { symbol: company }
          : type === "filing"
            ? { id: event?.id }
            : {},
      );
      await advanceJob(j);
      if (type === "filing" && event) await openEvent(event);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not start source job");
    }
  };
  useEffect(() => {
    const pending = data?.jobs?.[0];
    if (pending && !jobRunning.current) void advanceJob(pending);
  }, [data?.jobs, advanceJob]);
  useEffect(() => {
    if (view !== "research" || !routeReady) return;
    let active = true;
    void api<{
      page: CompanyPage;
      job: Job | null;
      worker: { active: boolean; scheduledEveryMinutes: number | null };
    }>("company-page", {
      symbol: company,
      ...(asOf ? { asOf: asOf + "T23:59:59+05:30" } : {}),
    })
      .then((r) => {
        if (!active) return;
        setCompanyPage(r.page);
        if (r.job) {
          if (!r.worker.active)
            setNotice(
              r.worker.scheduledEveryMinutes
                ? `Sources queued. Background processing runs every ${r.worker.scheduledEveryMinutes} minutes; you can return later.`
                : "Sources queued. Background processing resumes when the worker is available.",
            );
          void advanceJob(r.job);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [view, company, asOf, routeReady, advanceJob]);
  const saveRules = async () => {
    setSaving(true);
    try {
      await api("settings", rules);
      await load();
      setShowSettings(false);
      setNotice("Alert rules saved. They apply to the next source refresh.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
    }
  };
  const openEvent = async (e: Filing) => {
    const version = ++eventVersion.current;
    setEvent(e);
    setEventEvidence([]);
    try {
      await api("read", { id: e.id, read: true });
      setData((d) => (d ? { ...d, read: [...new Set([...d.read, e.id])] } : d));
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not save read state",
      );
    }
    try {
      const rows = await api<Evidence[]>(
        "filing-evidence?id=" + encodeURIComponent(e.id),
      );
      if (version === eventVersion.current) setEventEvidence(rows);
    } catch {
      /* Original source remains available. */
    }
  };
  const changePortfolio = async (symbol: string, add: boolean) => {
    if (!data) return;
    try {
      await api("portfolio", {
        symbols: add
          ? [...data.portfolio.map((c) => c.symbol), symbol]
          : data.portfolio
              .filter((c) => c.symbol !== symbol)
              .map((c) => c.symbol),
      });
      setAddQuery("");
      await load();
      setNotice(
        add
          ? `${symbol} added. Refresh to collect its sources.`
          : `${symbol} removed.`,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };
  const end = useMemo(
    () =>
      mode === "snapshot" && data
        ? snapshotEnd(data.snapshotEvents, data.snapshotAt)
        : new Date(),
    [mode, data],
  );
  const visible = useMemo(() => {
    if (!data) return [];
    const high =
      windowDays === "custom"
        ? Date.parse(to + "T23:59:59+05:30")
        : end.getTime();
    const low =
      windowDays === "custom"
        ? Date.parse(from + "T00:00:00+05:30")
        : high - Number(windowDays) * 86400000;
    return (mode === "snapshot" ? data.snapshotEvents : data.events)
      .filter(
        (e) =>
          Date.parse(e.publishedAt) >= low && Date.parse(e.publishedAt) <= high,
      )
      .filter((e) => filter === "all" || e.category === filter)
      .filter((e) =>
        `${e.symbol} ${e.company} ${e.description}`
          .toLowerCase()
          .includes(feedSearch.toLowerCase()),
      )
      .sort(
        (a, b) =>
          ({ high: 0, watch: 1, routine: 2 })[a.priority] -
            { high: 0, watch: 1, routine: 2 }[b.priority] ||
          b.publishedAt.localeCompare(a.publishedAt),
      );
  }, [data, windowDays, end, mode, from, to, filter, feedSearch]);
  const high = visible.filter((e) => e.priority === "high"),
    watch = visible.filter((e) => e.priority === "watch"),
    routineItems = visible.filter((e) => e.priority === "routine");
  const previews =
    (mode === "snapshot" ? data?.snapshotMarkets : data?.markets)?.filter(
      (m) =>
        (m.change !== null && Math.abs(m.change) > rules.priceThreshold) ||
        (m.volumeRatio !== null && m.volumeRatio > rules.volumeMultiplier),
    ) ?? [];
  const activeJob = job?.status === "running";
  const card = (e: Filing) => (
    <EventCard
      key={e.id}
      event={e}
      read={data?.read.includes(e.id) ?? false}
      open={() => void openEvent(e)}
      investigate={() => investigate(e.symbol)}
    />
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          aria-label="FINN home"
          onClick={() => setView("today")}
        >
          finn<span>✳</span>
        </button>
        <div className="brand-sub">A little clarity. Every day.</div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {(
            [
              { id: "today", label: "Today", icon: Inbox },
              { id: "research", label: "Research", icon: BookOpen },
              { id: "portfolio", label: "Portfolio", icon: Layers3 },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              aria-current={view === n.id ? "page" : undefined}
              className={"nav-item " + (view === n.id ? "active" : "")}
              onClick={() => {
                setView(n.id);
                window.scrollTo(0, 0);
              }}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "portfolio" && (
                <small>{data?.portfolio.length ?? 18}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={21} />
          <strong>Evidence, always.</strong>
          <p>
            Company documents.
            <br />
            Visible sources.
            <br />
            Room for uncertainty.
          </p>
          <button
            className="text-button"
            onClick={() => {
              setView("research");
              setTab("documents");
            }}
          >
            Explore the source library <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="profile">
          <span className="avatar">PS</span>
          <div>
            <strong>Prabhat’s workspace</strong>
            <small>Mock portfolio · NSE</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            finn<span>✳</span>
          </div>
          <span className="breadcrumb">
            Workspace <ChevronRight size={13} />{" "}
            <b>
              {view === "today"
                ? "Portfolio brief"
                : view === "research"
                  ? "Company research"
                  : "Your portfolio"}
            </b>
          </span>
          <div className="row">
            <span className="source-status">
              <i /> Primary-source workspace
            </span>
            <button
              className="icon-button"
              aria-label="Configure alerts"
              onClick={() => setShowSettings(true)}
            >
              <Settings2 size={19} />
            </button>
          </div>
        </header>
        <main>
          {error && (
            <div role="alert" className="error-banner">
              <CircleAlert size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {!data ? (
            <Spinner text="Opening your portfolio brief…" />
          ) : (
            <>
              {view === "today" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">
                        <span className="tiny-line" /> YOUR PORTFOLIO, IN
                        PERSPECTIVE
                      </div>
                      <h1>
                        Less noise.
                        <br className="mobile-break" /> More signal
                        <span className="accent">.</span>
                      </h1>
                      <p>
                        The changes worth your attention. The evidence to go
                        deeper.
                      </p>
                    </div>
                    <button
                      className="button refresh"
                      disabled={activeJob}
                      onClick={() => void runJob("refresh")}
                    >
                      <RefreshCw
                        size={16}
                        className={activeJob ? "spin" : ""}
                      />
                      {activeJob ? "Refreshing…" : "Refresh sources"}
                    </button>
                  </div>
                  <div className="snapshot-strip">
                    <div className="row">
                      <Clock3 size={15} />
                      <strong>
                        {mode === "snapshot"
                          ? "Saved source snapshot"
                          : "Current window"}
                      </strong>
                      <span>
                        Window ending {date(end.toISOString(), true)} ·{" "}
                        {time(end.toISOString())} IST
                      </span>
                    </div>
                    <div className="segmented small-segment">
                      <button
                        aria-pressed={mode === "snapshot"}
                        className={mode === "snapshot" ? "selected" : ""}
                        onClick={() => setMode("snapshot")}
                      >
                        Snapshot
                      </button>
                      <button
                        aria-pressed={mode === "live"}
                        className={mode === "live" ? "selected" : ""}
                        onClick={() => setMode("live")}
                      >
                        Today
                      </button>
                    </div>
                  </div>
                  <div className="brief-stats">
                    {[
                      {
                        count: high.length,
                        kind: "high",
                        label: "Worth a closer look",
                      },
                      {
                        count: watch.length,
                        kind: "watch",
                        label: "On your radar",
                      },
                      {
                        count: routineItems.length,
                        kind: "routine",
                        label: "Routine, tucked away",
                      },
                    ].map((s) => (
                      <div key={s.kind}>
                        <span className={"stat-marker " + s.kind} />
                        <strong>{s.count}</strong>
                        <span>{s.label}</span>
                      </div>
                    ))}
                    <div className="stat-covered">
                      <ShieldCheck size={18} />
                      <b>{data.portfolio.length}</b>
                      <span>companies followed</span>
                    </div>
                  </div>
                  <div className="content-grid">
                    <section className="feed">
                      <div className="section-bar">
                        <h2>
                          Your attention inbox{" "}
                          <span className="count">{visible.length}</span>
                        </h2>
                        <div className="segmented">
                          <button
                            className={windowDays === "1" ? "selected" : ""}
                            onClick={() => setWindowDays("1")}
                          >
                            24 hours
                          </button>
                          <button
                            className={windowDays === "7" ? "selected" : ""}
                            onClick={() => setWindowDays("7")}
                          >
                            7 days
                          </button>
                          <button
                            aria-label="Custom date window"
                            className={
                              windowDays === "custom" ? "selected" : ""
                            }
                            onClick={() => setWindowDays("custom")}
                          >
                            <CalendarDays size={14} />
                            Custom
                          </button>
                        </div>
                      </div>
                      {windowDays === "custom" && (
                        <div className="custom-dates">
                          <label>
                            From
                            <input
                              type="date"
                              value={from}
                              onInput={(e) => setFrom(e.currentTarget.value)}
                              onChange={(e) => setFrom(e.target.value)}
                              max={to}
                            />
                          </label>
                          <ArrowRight size={16} />
                          <label>
                            Through
                            <input
                              type="date"
                              value={to}
                              onInput={(e) => setTo(e.currentTarget.value)}
                              onChange={(e) => setTo(e.target.value)}
                              min={from}
                            />
                          </label>
                        </div>
                      )}
                      <div className="feed-controls">
                        <label className="search-control">
                          <Search size={16} />
                          <input
                            aria-label="Filter portfolio inbox"
                            placeholder="Find a company or filing"
                            value={feedSearch}
                            onChange={(e) => setFeedSearch(e.target.value)}
                          />
                        </label>
                        <label className="category-select">
                          <SlidersHorizontal size={15} />
                          <select
                            aria-label="Announcement category"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                          >
                            <option value="all">All categories</option>
                            {Object.entries(CATEGORY_LABELS).map(
                              ([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>
                      {!visible.length && (
                        <Empty title="No collected filings in this window">
                          <p>
                            This window is quiet in the collected data. Review
                            source coverage, try a wider window, or refresh.
                          </p>
                          <button
                            className="button"
                            onClick={() => setWindowDays("7")}
                          >
                            See the last 7 days <ArrowRight size={15} />
                          </button>
                        </Empty>
                      )}
                      {!!high.length && (
                        <div className="group-label">
                          <span className="stat-marker high" />
                          WORTH A CLOSER LOOK<span>{high.length}</span>
                        </div>
                      )}
                      {high.map(card)}
                      {!!watch.length && (
                        <div className="group-label">
                          <span className="stat-marker watch" />
                          ON YOUR RADAR<span>{watch.length}</span>
                        </div>
                      )}
                      {watch.map(card)}
                      {!!routineItems.length && (
                        <div className="routine-section">
                          <button
                            className="routine-toggle"
                            aria-expanded={routine}
                            onClick={() => setRoutine(!routine)}
                          >
                            <span className="routine-icon">
                              <Layers3 size={19} />
                            </span>
                            <span>
                              <strong>
                                {routineItems.length} routine filings
                              </strong>
                              <small>
                                Meeting notices, compliance and other paperwork
                              </small>
                            </span>
                            <ChevronDown
                              className={routine ? "rotated" : ""}
                              size={18}
                            />
                          </button>
                          {routine && routineItems.map(card)}
                        </div>
                      )}
                      <p className="feed-foot">
                        <CheckCheck size={14} />
                        All successfully collected filings remain inspectable.
                        Ranking uses transparent rules.
                      </p>
                    </section>
                    <aside className="context-rail">
                      <section className="research-promo">
                        <div className="eyebrow">
                          <Sparkles size={14} /> GO ONE LEVEL DEEPER
                        </div>
                        <div className="promo-symbol">“</div>
                        <h2>
                          They said it.
                          <br />
                          Did they deliver?
                        </h2>
                        <p>
                          Follow a management target from the first promise to
                          the reported outcome.
                        </p>
                        <div className="promo-company">
                          <span className="company-initial">i</span>
                          <div>
                            <strong>Infosys</strong>
                            <small>A complete guidance cycle · FY25</small>
                          </div>
                        </div>
                        <button onClick={() => investigate("INFY")}>
                          Open the evidence ledger <ArrowRight size={17} />
                        </button>
                      </section>
                      <section className="rail-card">
                        <div className="row spread">
                          <h3>Market watch</h3>
                          <button
                            className="icon-button"
                            aria-label="Edit market thresholds"
                            onClick={() => setShowSettings(true)}
                          >
                            <SlidersHorizontal size={16} />
                          </button>
                        </div>
                        <p className="small muted">
                          {mode === "snapshot"
                            ? "Rule preview on saved EOD observations."
                            : "Latest collected EOD observations matching your rules."}
                        </p>
                        {previews.length ? (
                          previews.slice(0, 4).map((m) => (
                            <button
                              className="market-row"
                              key={m.symbol}
                              onClick={() => investigate(m.symbol)}
                            >
                              <div>
                                <strong>{m.symbol}</strong>
                                <small>
                                  {m.latest?.date
                                    ? date(m.latest.date)
                                    : "Unavailable"}
                                </small>
                              </div>
                              <div>
                                <strong
                                  className={
                                    (m.change ?? 0) < 0
                                      ? "negative"
                                      : "positive"
                                  }
                                >
                                  {signed(m.change)}
                                </strong>
                                <small>{num(m.volumeRatio)}× volume</small>
                              </div>
                            </button>
                          ))
                        ) : (
                          <p className="small">
                            No collected observation crosses your rules.
                          </p>
                        )}
                        <button
                          className="text-button rail-link"
                          onClick={() => setShowSettings(true)}
                        >
                          Price ±{rules.priceThreshold}% · volume{" "}
                          {rules.volumeMultiplier}× <ArrowRight size={14} />
                        </button>
                      </section>
                      <Coverage data={data} />
                    </aside>
                  </div>
                </>
              )}

              {view === "research" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">
                        <span className="tiny-line" /> FROM THE COMPANY. TO THE
                        POINT.
                      </div>
                      <h1 className="research-title">
                        Follow the evidence<span className="accent">.</span>
                      </h1>
                      <p>
                        Research through the company’s own reports and
                        management commentary.
                      </p>
                    </div>
                  </div>
                  <div className="research-search-wrap">
                    <label className="research-search">
                      <Search size={21} />
                      <input
                        aria-label="Search any NSE company"
                        placeholder="Search any NSE ticker or company…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <span className="search-hint">NSE</span>
                    </label>
                    {!!query.trim() && !!matches.length && (
                      <div className="search-results">
                        {matches.map((c) => (
                          <button
                            key={c.symbol}
                            onClick={() => investigate(c.symbol)}
                          >
                            <strong>{c.symbol}</strong>
                            <span>{c.name}</span>
                            <ArrowUpRight size={15} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="prepared-list">
                    <span>Ready to explore</span>
                    {["INFY", "HCLTECH", "POLYCAB", "TCS"].map((s) => (
                      <button
                        key={s}
                        className={company === s ? "selected" : ""}
                        onClick={() => investigate(s)}
                      >
                        {s}
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                  </div>
                  {researchLoading && (
                    <Spinner
                      text={
                        answerMode
                          ? "Preparing your answer and checking its sources… This may take up to a minute."
                          : "Searching the source documents…"
                      }
                    />
                  )}
                  {research && research.company.symbol === company && (
                    <>
                      <section className="company-header">
                        <div className="row">
                          <span className="company-mark">
                            {company.slice(0, 2)}
                          </span>
                          <div>
                            <div className="eyebrow">
                              NSE: {company} · {research.company.sector}
                            </div>
                            <h2>
                              {research.company.name.replace(/ Limited$/, "")}
                            </h2>
                            <div className="small muted">
                              {research.company.isin}
                            </div>
                          </div>
                        </div>
                        <button
                          className="button"
                          disabled={activeJob}
                          onClick={() => void runJob("research")}
                        >
                          <RefreshCw
                            size={15}
                            className={activeJob ? "spin" : ""}
                          />
                          Discover documents
                        </button>
                      </section>
                      <div className="document-coverage">
                        <span>
                          <BookOpen size={16} />
                          <b>{research.coverage.annualReports}</b> annual
                          reports
                        </span>
                        <span>
                          <FileText size={16} />
                          <b>{research.coverage.transcripts}</b> transcripts
                        </span>
                        <span
                          className={
                            research.coverage.failed ? "coverage-gap" : ""
                          }
                        >
                          <CircleAlert size={15} />
                          {research.coverage.failed
                            ? `${research.coverage.failed} source gaps`
                            : "Source-linked evidence"}
                        </span>
                        <span className="engine-label">
                          {research.model?.configured
                            ? "GLM 5.3 Flash · via Hyde"
                            : "Evidence search · model not configured"}
                        </span>
                      </div>
                      <div
                        className="research-tabs"
                        role="tablist"
                        aria-label="Research sections"
                      >
                        {(
                          [
                            "ledger",
                            "changes",
                            "evidence",
                            "documents",
                          ] as const
                        ).map((t) => (
                          <button
                            key={t}
                            role="tab"
                            aria-selected={tab === t}
                            className={tab === t ? "selected" : ""}
                            onClick={() => setTab(t)}
                          >
                            {t === "ledger"
                              ? "Said / delivered"
                              : t === "changes"
                                ? "What changed?"
                                : t === "evidence"
                                  ? "Ask the evidence"
                                  : "Source library"}
                          </button>
                        ))}
                      </div>
                      {companyPage?.company.symbol === company && (
                        <CompanyOverview page={companyPage} />
                      )}
                      {tab === "changes" && (
                        <>
                          {companyPage?.company.symbol === company && (
                            <QuarterChanges
                              changes={companyPage.quarterChanges}
                              onQuestion={(q) => {
                                setTab("evidence");
                                ask(q);
                              }}
                            />
                          )}
                          <CallComparison
                            key={company + asOf}
                            symbol={company}
                            asOf={asOf}
                          />
                        </>
                      )}
                      {tab === "ledger" &&
                        (company === "INFY" && analysis.ledger ? (
                          <Ledger
                            ledger={analysis.ledger}
                            results={analysis.results}
                            onEvidence={setLedgerSource}
                          />
                        ) : reviewed.find((a) => a.symbol === company) ? (
                          <FinancialAnalysis
                            analysis={reviewed.find(
                              (a) => a.symbol === company,
                            )!}
                            onEvidence={setLedgerSource}
                          />
                        ) : (
                          <>
                            <Empty title="No verified comparison prepared yet">
                              <p>
                                A comparison needs a dated management target and
                                a matching actual. Available company passages
                                are ready to inspect.
                              </p>
                              <button
                                className="button"
                                onClick={() => {
                                  setQuestion("guidance outlook");
                                  setTab("evidence");
                                }}
                              >
                                Inspect management commentary{" "}
                                <ArrowRight size={15} />
                              </button>
                            </Empty>
                            {research.results && (
                              <ResultsTable
                                results={research.results}
                                onEvidence={setLedgerSource}
                              />
                            )}
                          </>
                        ))}
                      {tab === "evidence" && (
                        <section className="research-evidence">
                          <div className="question-intro">
                            <h2>Start with a question.</h2>
                            <p>
                              Ask a question. Inspect the supporting passages.
                              See what remains uncertain.
                            </p>
                          </div>
                          <form
                            className="question-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              ask(questionInput);
                            }}
                          >
                            <input
                              aria-label="Question for company evidence"
                              value={questionInput}
                              onChange={(e) => setQuestionInput(e.target.value)}
                              placeholder="What did management say about growth?"
                              maxLength={500}
                              required
                            />
                            <button
                              className="primary-button"
                              aria-label={
                                research.model?.configured
                                  ? "Ask FINN"
                                  : "Find evidence"
                              }
                              type="submit"
                            >
                              <ArrowRight size={19} />
                              <span>
                                {research.model?.configured
                                  ? "Ask FINN"
                                  : "Find evidence"}
                              </span>
                            </button>
                          </form>
                          <div className="question-chips">
                            {[
                              "What was revenue growth?",
                              "Did management meet guidance?",
                              "What is the business?",
                              "What is the revenue guidance?",
                              "How is cash conversion?",
                              "What are the risks?",
                            ].map((q) => (
                              <button key={q} onClick={() => ask(q)}>
                                {q}
                              </button>
                            ))}
                          </div>
                          <div className="asof-control">
                            <label>
                              <CalendarDays size={15} />
                              Evidence available by{" "}
                              <input
                                aria-label="Research as of date"
                                type="date"
                                value={asOf}
                                max={new Date().toLocaleDateString("en-CA", {
                                  timeZone: "Asia/Kolkata",
                                })}
                                onInput={(e) => {
                                  setAnswerMode(false);
                                  setAsOf(e.currentTarget.value);
                                }}
                                onChange={(e) => {
                                  setAnswerMode(false);
                                  setAsOf(e.target.value);
                                }}
                              />
                            </label>
                            <button
                              className="text-button"
                              disabled={!asOf}
                              onClick={() => {
                                setAnswerMode(false);
                                setAsOf("");
                              }}
                            >
                              Use all available evidence
                            </button>
                          </div>
                          {research.structured && (
                            <StructuredAnswer answer={research.structured} />
                          )}
                          {research.retrieval && !research.structured && (
                            <details className="answer-method">
                              <summary>
                                Search method:{" "}
                                {research.retrieval.mode === "hybrid"
                                  ? "keyword + semantic"
                                  : "keyword"}
                              </summary>
                              <p>{research.retrieval.reason}</p>
                            </details>
                          )}
                          {research.modelError && (
                            <div className="model-note" role="status">
                              <CircleAlert size={17} />
                              <p>{research.modelError.message}</p>
                            </div>
                          )}
                          {research.synthesis && (
                            <ResearchAnswer answer={research.synthesis} />
                          )}
                          <details
                            className="retrieved-evidence"
                            open={!research.synthesis}
                          >
                            <summary>
                              {research.synthesis
                                ? "Explore the retrieved sources"
                                : "Relevant source passages"}{" "}
                              · {research.evidence.length}
                            </summary>
                            <div className="answer-header">
                              <Badge tone="green">
                                <ShieldCheck size={12} />
                                Primary evidence
                              </Badge>
                              <span className="small muted">
                                {research.evidence.length} relevant passages
                              </span>
                            </div>
                            <p className="answer-note">{research.message}</p>
                            {research.evidence.map((p, i) => (
                              <EvidenceCard
                                key={p.documentId + ":" + p.page + ":" + i}
                                item={p}
                                index={i}
                              />
                            ))}
                            {!research.evidence.length && (
                              <Empty title="The evidence does not answer this yet">
                                <p>
                                  Try a narrower question or discover documents.
                                  FINN does not fill gaps from company knowledge
                                  outside the sources.
                                </p>
                              </Empty>
                            )}
                          </details>
                        </section>
                      )}
                      {tab === "documents" && (
                        <section className="source-library">
                          <div className="section-bar">
                            <h2>Every answer starts here.</h2>
                            <span className="small muted">
                              {research.documents.length} records
                            </span>
                          </div>
                          <p className="small muted">
                            Screener discovers links. Research uses the
                            underlying company documents.
                          </p>
                          {!research.documents.length && (
                            <Empty title="No documents indexed">
                              <p>
                                Select “Discover documents” to run the same
                                pipeline used for the prepared companies.
                              </p>
                            </Empty>
                          )}
                          {research.documents.map((d, i) => (
                            <article
                              className="document-row"
                              key={d.id + ":" + i}
                            >
                              <span
                                className={
                                  "document-icon " +
                                  (d.status === "failed" ? "unavailable" : "")
                                }
                              >
                                <FileText size={22} />
                              </span>
                              <div className="document-info">
                                <div className="row wrap">
                                  <strong>{d.title}</strong>
                                  <Badge
                                    tone={
                                      d.status === "extracted"
                                        ? "green"
                                        : "amber"
                                    }
                                  >
                                    {d.status === "extracted"
                                      ? "Indexed"
                                      : d.status === "partial"
                                        ? "Limited text"
                                        : "Unavailable"}
                                  </Badge>
                                </div>
                                <div className="small muted">
                                  {d.type.replace("_", " ")} · {d.period}
                                  {d.pages ? ` · ${d.pages} PDF pages` : ""}
                                </div>
                                <p className="small">
                                  {d.status !== "extracted"
                                    ? d.error
                                    : d.identity}
                                </p>
                                <details>
                                  <summary>Provenance</summary>
                                  <div className="provenance">
                                    {d.hash && <span>SHA-256: {d.hash}</span>}
                                    <span>
                                      Fetched:{" "}
                                      {d.fetchedAt
                                        ? date(d.fetchedAt, true) +
                                          " " +
                                          time(d.fetchedAt) +
                                          " IST"
                                        : "Unavailable"}
                                    </span>
                                    <span>
                                      Publication:{" "}
                                      {d.publishedAt
                                        ? date(d.publishedAt, true)
                                        : "Unverified; retrieval is not publication"}
                                    </span>
                                    <span>
                                      Parser: {d.parser ?? "Not extracted"}
                                    </span>
                                    {d.metadata && (
                                      <>
                                        <span>
                                          Document date:{" "}
                                          {d.metadata.documentDate ??
                                            "Unverified"}{" "}
                                          · Call:{" "}
                                          {d.metadata.callDate ??
                                            "Not established"}
                                        </span>
                                        <span>
                                          Period ends:{" "}
                                          {d.metadata.periodEnd ?? "Unverified"}{" "}
                                          · Metadata: {d.metadata.status}
                                        </span>
                                        {d.metadata.warnings.map((w) => (
                                          <span key={w}>{w}</span>
                                        ))}
                                      </>
                                    )}
                                  </div>
                                </details>
                              </div>
                              <Source url={d.url} label="Original" />
                            </article>
                          ))}
                        </section>
                      )}
                    </>
                  )}
                </>
              )}

              {view === "portfolio" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">
                        <span className="tiny-line" /> YOUR COMPANIES. YOUR
                        THRESHOLDS.
                      </div>
                      <h1>
                        A considered watchlist<span className="accent">.</span>
                      </h1>
                      <p>
                        A mock portfolio across sectors. Follow up to 25 NSE
                        companies.
                      </p>
                    </div>
                    <button
                      className="button"
                      onClick={() => setShowSettings(true)}
                    >
                      <Bell size={16} />
                      Alert preferences
                    </button>
                  </div>
                  <div className="portfolio-summary">
                    <div>
                      <strong>{data.portfolio.length}</strong>
                      <span>companies</span>
                    </div>
                    <div>
                      <strong>
                        {new Set(data.portfolio.map((c) => c.sector)).size}
                      </strong>
                      <span>sectors</span>
                    </div>
                    <div>
                      <strong>
                        {data.markets.length}
                        <span>/{data.portfolio.length}</span>
                      </strong>
                      <span>price series</span>
                    </div>
                    <p>
                      Equal attention, no assumed position weights. Prices are
                      end-of-day observations, not live quotes.
                    </p>
                  </div>
                  <div className="research-search-wrap portfolio-add">
                    <label className="research-search">
                      <Plus size={20} />
                      <input
                        aria-label="Add a company to portfolio"
                        value={addQuery}
                        onChange={(e) => setAddQuery(e.target.value)}
                        placeholder="Add an NSE company to your portfolio"
                      />
                    </label>
                    {!!addQuery.trim() && !!addMatches.length && (
                      <div className="search-results">
                        {addMatches.map((c) => (
                          <button
                            key={c.symbol}
                            disabled={data.portfolio.some(
                              (p) => p.symbol === c.symbol,
                            )}
                            onClick={() => void changePortfolio(c.symbol, true)}
                          >
                            <strong>{c.symbol}</strong>
                            <span>{c.name}</span>
                            {data.portfolio.some(
                              (p) => p.symbol === c.symbol,
                            ) ? (
                              <Check size={16} />
                            ) : (
                              <Plus size={16} />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="portfolio-table">
                    <div className="portfolio-table-head">
                      <span>COMPANY</span>
                      <span>EOD CLOSE</span>
                      <span>DAILY MOVE</span>
                      <span>VOLUME / 20D</span>
                      <span />
                    </div>
                    {data.portfolio.map((c) => {
                      const m = data.markets.find((x) => x.symbol === c.symbol);
                      return (
                        <div className="portfolio-row" key={c.symbol}>
                          <button
                            className="portfolio-company"
                            onClick={() => investigate(c.symbol)}
                          >
                            <span className="ticker-avatar">
                              {c.symbol.slice(0, 2)}
                            </span>
                            <span>
                              <strong>{c.symbol}</strong>
                              <small>
                                {c.name.replace(/ Limited$/, "")} · {c.sector}
                              </small>
                            </span>
                          </button>
                          <div>
                            <strong>
                              {m?.latest ? "₹" + num(m.latest.close, 2) : "—"}
                            </strong>
                            <small>
                              {m?.latest
                                ? date(m.latest.date)
                                : "Refresh needed"}
                            </small>
                          </div>
                          <div
                            className={
                              (m?.change ?? 0) < 0 ? "negative" : "positive"
                            }
                          >
                            <strong>{signed(m?.change ?? null)}</strong>
                            <small className="mobile-only">daily change</small>
                          </div>
                          <div>
                            <strong>{num(m?.volumeRatio)}×</strong>
                            <small>volume / prior 20 sessions</small>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={"Remove " + c.symbol}
                            onClick={() =>
                              void changePortfolio(c.symbol, false)
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="feed-foot">
                    <CircleHelp size={14} />
                    Unadjusted close. Known split sessions suppress alerts; the
                    volume baseline excludes the current session.
                  </p>
                  <section className="saved-alerts">
                    <div className="section-bar">
                      <h2>Your triggered alerts</h2>
                      <Badge>{data.alerts.length} saved</Badge>
                    </div>
                    <p className="small muted">
                      Created by source refreshes using your saved rules.
                      Repeated sessions and filings are deduplicated.
                    </p>
                    {data.alerts.length ? (
                      data.alerts.slice(0, 20).map((a) => (
                        <div className="saved-alert" key={a.id}>
                          <Bell size={16} />
                          <strong>{a.symbol}</strong>
                          <span>{a.detail}</span>
                          <Source url={a.source} />
                        </div>
                      ))
                    ) : (
                      <p className="small">
                        No live alerts saved yet. Refresh sources to evaluate
                        your rules.
                      </p>
                    )}
                  </section>
                </>
              )}
              {job && (
                <section className="job-status" aria-live="polite">
                  <div className="row spread">
                    <div className="row">
                      {activeJob ? (
                        <LoaderCircle className="spin" size={18} />
                      ) : job.status === "complete" ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <CircleAlert size={18} />
                      )}
                      <strong>{job.stage}</strong>
                    </div>
                    <button
                      className="icon-button"
                      disabled={activeJob}
                      aria-label="Dismiss job status"
                      onClick={() => setJob(null)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <progress max={job.total || 1} value={job.progress || 0} />
                  <div className="small muted">
                    {job.progress ?? 0} / {job.total ?? 1} stages completed
                  </div>
                  {job.error && <p>{job.error}</p>}
                  {!!job.warnings?.length && (
                    <details>
                      <summary>{job.warnings.length} source gaps</summary>
                      <ul>
                        {job.warnings.map((w: string, i: number) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </section>
              )}
              <footer>
                <span className="footer-logo">finn✳</span>
                <span>Primary sources. Considered decisions.</span>
                <span className="footer-note">
                  Prototype · Research support, not investment advice
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      <dialog
        ref={dialog}
        className="detail-dialog"
        onCancel={close}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="dialog-content">
          <button
            className="dialog-close icon-button"
            aria-label="Close panel"
            onClick={close}
          >
            <X size={22} />
          </button>
          {event && (
            <>
              <div className="eyebrow">
                {event.symbol} · {CATEGORY_LABELS[event.category]}
              </div>
              <h2>{headline(event)}</h2>
              <div className="row wrap">
                <Badge tone={event.priority === "high" ? "amber" : "green"}>
                  {event.priority === "high"
                    ? "Closer look"
                    : event.priority === "watch"
                      ? "On your radar"
                      : "Routine"}
                </Badge>
                <span className="small muted">
                  {date(event.publishedAt, true)} · {time(event.publishedAt)}{" "}
                  IST
                </span>
              </div>
              <div className="detail-section">
                <h3>What was filed</h3>
                <p>{event.description}</p>
                <span className="small muted">
                  Exchange description · reported fact
                </span>
              </div>
              <div className="detail-section priority-explanation">
                <h3>Why it is here</h3>
                <p>{event.reason}</p>
                <span className="small muted">
                  FINN rule-based prioritisation · interpretation
                </span>
              </div>
              <div className="detail-section">
                <h3>Check the original</h3>
                <p className="small muted">
                  {event.source} corporate disclosure · {event.id}
                </p>
                <Source url={event.url} label="Read the exchange filing" />
                {eventEvidence.length ? (
                  <EvidenceCard item={eventEvidence[0]} index={0} />
                ) : (
                  <div>
                    <p className="small muted">
                      The summary comes from the exchange description. Index the
                      original attachment for source excerpts.
                    </p>
                    <button
                      className="button"
                      disabled={activeJob}
                      onClick={() => void runJob("filing")}
                    >
                      Read attachment
                    </button>
                  </div>
                )}
              </div>
              {reviewed.find((a) =>
                a.results.evidence.some((e) => e.url === event.url),
              ) && (
                <ResultsTable
                  results={
                    reviewed.find((a) =>
                      a.results.evidence.some((e) => e.url === event.url),
                    )!.results
                  }
                  onEvidence={(rows) => {
                    setEvent(null);
                    setLedgerSource(rows);
                  }}
                />
              )}
              <button
                className="primary-button full"
                onClick={() => {
                  investigate(event.symbol);
                  close();
                }}
              >
                Investigate {event.symbol}
                <ArrowRight size={17} />
              </button>
            </>
          )}
          {showSettings && (
            <>
              <div className="eyebrow">MAKE THE SIGNAL YOURS</div>
              <h2>Your alert preferences</h2>
              <p className="muted">
                Choose what deserves a place in your inbox.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveRules();
                }}
              >
                <div className="settings-block">
                  <h3>Unusual market activity</h3>
                  <label className="number-setting">
                    <span>
                      <strong>Daily price move</strong>
                      <small>Between completed sessions</small>
                    </span>
                    <div>
                      <span>±</span>
                      <input
                        aria-label="Price movement threshold"
                        type="number"
                        min="0.1"
                        max="30"
                        step="0.1"
                        value={rules.priceThreshold}
                        onChange={(e) =>
                          setRules({
                            ...rules,
                            priceThreshold: Number(e.target.value),
                          })
                        }
                      />
                      <span>%</span>
                    </div>
                  </label>
                  <label className="number-setting">
                    <span>
                      <strong>Volume multiplier</strong>
                      <small>Versus the previous 20 sessions</small>
                    </span>
                    <div>
                      <input
                        aria-label="Volume multiplier"
                        type="number"
                        min="1"
                        max="20"
                        step="0.1"
                        value={rules.volumeMultiplier}
                        onChange={(e) =>
                          setRules({
                            ...rules,
                            volumeMultiplier: Number(e.target.value),
                          })
                        }
                      />
                      <span>×</span>
                    </div>
                  </label>
                </div>
                <div className="settings-block">
                  <h3>Announcement categories</h3>
                  <p className="small muted">
                    Selected non-routine categories create alerts. Every
                    collected filing stays inspectable.
                  </p>
                  <div className="category-checkboxes">
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={rules.categories.includes(key)}
                          onChange={(e) =>
                            setRules({
                              ...rules,
                              categories: e.target.checked
                                ? [...rules.categories, key]
                                : rules.categories.filter((c) => c !== key),
                            })
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <label className="category-checkboxes">
                  <span>
                    <input
                      type="checkbox"
                      checked={rules.monitorEnabled ?? false}
                      onChange={(e) =>
                        setRules({ ...rules, monitorEnabled: e.target.checked })
                      }
                    />{" "}
                    Include this portfolio in background refreshes when the
                    hosting schedule is enabled
                  </span>
                </label>
                <div className="settings-foot">
                  <ShieldCheck size={16} />
                  <p>
                    Saved on the server. Rules run on refresh. Device
                    notifications and an unattended hosting schedule are not
                    enabled.
                  </p>
                </div>
                <button
                  className="primary-button full"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Saving…" : "Save preferences"}
                  <Check size={17} />
                </button>
              </form>
            </>
          )}
          {ledgerSource && (
            <>
              <div className="eyebrow">THE RECEIPTS</div>
              <h2>Inspect the supporting evidence</h2>
              <p className="muted">
                Source passages behind the manually verified comparison.
              </p>
              {ledgerSource.map((p, i) => (
                <EvidenceCard key={i} item={p} index={i} />
              ))}
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}

function EventCard({
  event: e,
  read,
  open,
  investigate,
}: {
  event: Filing;
  read: boolean;
  open: () => void;
  investigate: () => void;
}) {
  return (
    <article className={`event-card ${e.priority} ${read ? "read" : ""}`}>
      <div className="row spread">
        <div className="row event-meta">
          <span className="company-badge">{e.symbol}</span>
          <span className="event-category">{CATEGORY_LABELS[e.category]}</span>
        </div>
        <span className="event-date">
          {date(e.publishedAt)}
          {read && <CheckCheck size={12} />}
        </span>
      </div>
      <button className="headline-button" onClick={open}>
        <h3>{headline(e)}</h3>
      </button>
      <p className="event-reason">{e.reason}</p>
      <div className="event-actions">
        <button className="text-button" onClick={open}>
          Inspect filing
          <ChevronRight size={14} />
        </button>
        <button className="text-button investigate" onClick={investigate}>
          Investigate
          <ArrowUpRight size={14} />
        </button>
        <span className="source-stamp">
          <span />
          NSE filing
        </span>
      </div>
    </article>
  );
}
function Coverage({ data }: { data: Dashboard }) {
  return (
    <section className="rail-card coverage">
      <div className="row spread">
        <h3>Behind this brief</h3>
        <ShieldCheck size={18} />
      </div>
      {[
        {
          label: "Price sources checked",
          value: `${data.runs.filter((r) => r.source === "prices" && r.status === "success").length}/${data.portfolio.length}`,
        },
        {
          label: "NSE responses received",
          value: `${data.runs.filter((r) => r.source === "filings" && r.status === "success").length}/${data.portfolio.length}`,
        },
        {
          label: "Failed source runs",
          value: data.runs.filter((r) => r.status === "failed").length,
        },
      ].map((r) => (
        <div className="coverage-row" key={r.label}>
          <span>{r.label}</span>
          <strong>{r.value}</strong>
        </div>
      ))}
      <div className="coverage-bottom">
        <Clock3 size={14} />
        <span>
          Latest source check
          <br />
          <b>
            {date(
              data.runs
                .map((r) => r.finishedAt)
                .filter(Boolean)
                .sort()
                .at(-1) ?? data.snapshotAt,
              true,
            )}{" "}
            ·{" "}
            {time(
              data.runs
                .map((r) => r.finishedAt)
                .filter(Boolean)
                .sort()
                .at(-1) ?? data.snapshotAt,
            )}{" "}
            IST
          </b>
        </span>
      </div>
      <details>
        <summary>Source freshness and failures</summary>
        {data.runs.map((r, i) => (
          <p className="small" key={i}>
            {r.symbol} · {r.source} · {r.status} · {date(r.finishedAt, true)}{" "}
            {time(r.finishedAt)} IST{r.error ? ` — ${r.error}` : ""}
          </p>
        ))}
      </details>
      <p className="small muted">
        Coverage is limited to retrieved responses. Complete exchange pagination
        is not guaranteed.
      </p>
    </section>
  );
}
function Ledger({
  ledger: l,
  results: r,
  onEvidence,
}: {
  ledger: typeof prepared.ledger;
  results: typeof prepared.results;
  onEvidence: (e: Evidence[]) => void;
}) {
  return (
    <div className="ledger">
      <div className="ledger-intro">
        <div>
          <div className="eyebrow">
            VERIFIED HISTORICAL EXAMPLE · {l.period}
          </div>
          <h2>One target. A changing outlook.</h2>
          <p>{l.description}</p>
        </div>
        <Badge tone="green">
          <ShieldCheck size={13} />
          Manually source-checked
        </Badge>
      </div>
      <div className="ledger-feature">
        <div className="promise">
          <span className="eyebrow">WHAT MANAGEMENT SAID</span>
          <div className="ledger-number">
            {l.finalLow}–{l.finalHigh}
            <span>%</span>
          </div>
          <p>Final revenue growth guidance</p>
          <span className="small">
            {l.basis} · {l.period}
          </span>
          <button
            className="text-button"
            onClick={() => onEvidence([l.revisions.at(-1)!.evidence])}
          >
            Read the statement <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="versus">
          <ArrowRight size={24} />
        </div>
        <div className="delivered">
          <span className="eyebrow">WHAT HAPPENED</span>
          <div className="ledger-number">
            {l.actual}
            <span>%</span>
          </div>
          <p>Reported full-year revenue growth</p>
          <Badge tone="amber">
            {num(l.finalLow - l.actual)} pp below the final lower bound
          </Badge>
          <button
            className="text-button"
            onClick={() => onEvidence([l.actualEvidence])}
          >
            Verify the actual <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
      <div className="interpretation">
        <CircleHelp size={19} />
        <div>
          <strong>The useful distinction</strong>
          <p>{l.interpretation}</p>
          <small>
            Interpretation · Computed from source-checked values. This is not a
            management credibility score.
          </small>
        </div>
      </div>
      <div className="section-bar timeline-title">
        <h3>How the target evolved</h3>
        <span className="small muted">
          One annual target, preserved across revisions
        </span>
      </div>
      <div className="guidance-timeline">
        {l.revisions.map((v, i) => (
          <button
            key={v.date}
            className="timeline-step"
            onClick={() => onEvidence([v.evidence])}
          >
            <div className="timeline-top">
              <span className="timeline-dot">{i + 1}</span>
              <span>{date(v.date, true)}</span>
            </div>
            <strong>
              {v.low}–{v.high}%
            </strong>
            <span>{v.label}</span>
            <small>{v.speaker}</small>
            <span className="timeline-source">
              Source <ArrowUpRight size={12} />
            </span>
          </button>
        ))}
      </div>
      <div className="method-note">
        <ShieldCheck size={17} />
        <p>
          <strong>Comparable by design.</strong> {l.method} Evaluation as of{" "}
          {date(l.asOf, true)}. Interim guidance remained pending until the
          financial year ended.
        </p>
      </div>
      {r && (
        <section className="results-section">
          <div className="section-bar">
            <h3>A first cut of the numbers</h3>
            <Badge>{r.period}</Badge>
          </div>
          <p className="small muted">
            {r.scope} · {r.currency} {r.unit} · {r.basis}
          </p>
          <div className="results-table">
            <div className="results-head">
              <span>METRIC</span>
              <span>{r.currentLabel}</span>
              <span>QoQ</span>
              <span>YoY</span>
            </div>
            {r.metrics.map((m) => (
              <div className="results-row" key={m.name}>
                <div>
                  <strong>{m.name}</strong>
                  {m.note && <small>{m.note}</small>}
                </div>
                <strong>
                  {m.current === null ? "Unavailable" : num(m.current, 0)}
                </strong>
                <span>
                  {m.current !== null && m.previous !== null
                    ? signed(growth(m.current, m.previous))
                    : "—"}
                </span>
                <span>
                  {m.current !== null && m.yearAgo !== null
                    ? signed(growth(m.current, m.yearAgo))
                    : "—"}
                </span>
              </div>
            ))}
          </div>
          <button
            className="text-button"
            onClick={() => onEvidence(r.evidence)}
          >
            Inspect values and reporting basis <ArrowUpRight size={14} />
          </button>
        </section>
      )}
    </div>
  );
}
