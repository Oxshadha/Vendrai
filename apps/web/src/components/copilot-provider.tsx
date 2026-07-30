"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAssistanceRegistry } from "@/components/assistance-registry";
import { api, type CopilotMessage, type CopilotSession } from "@/lib/api";
import { getTour, stepsForRoles, WELCOME_TOUR_ID, type TourStep } from "@/lib/tours";
import { useAuth } from "@/app/providers";

const SESSION_STORAGE_KEY = "neurox-copilot-session";
/** Set on Finish *or* Skip, so a declined tour never nags again. */
const WELCOME_SEEN_KEY = "vendrai.tour.welcome.v1";

export interface TourState {
  tourId: string;
  index: number;
  /** Role-filtered steps, resolved once at start so the count stays stable. */
  steps: TourStep[];
}

function caseIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/cases\/([0-9a-f]{8}-[0-9a-f-]{27,})/i);
  return match?.[1];
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "COPILOT_UNAVAILABLE";
  if (message.toLowerCase().includes("failed to fetch") || message.includes("ECONNREFUSED")) {
    return "Vendrai services are not reachable yet. Start the product runtime, then retry.";
  }
  if (message.includes("LLM_AUTH_INVALID")) {
    return "Gemini rejected the configured key. Ask an administrator to verify it.";
  }
  if (message.includes("LLM_QUOTA_EXCEEDED")) {
    return "Gemini quota is exhausted. Deterministic work is preserved for retry.";
  }
  return message.replaceAll("_", " ");
}

interface CopilotContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openCopilot: () => void;
  messages: CopilotMessage[];
  question: string;
  setQuestion: (question: string) => void;
  loading: boolean;
  error: string;
  submit: (event: FormEvent) => void;
  /** Fire a canned question directly (quick actions), bypassing the textarea. */
  ask: (text: string) => void;
  runAction: (action: CopilotMessage["ui_actions"][number]) => void;
  sendFeedback: (messageId: string, rating: "HELPFUL" | "NOT_HELPFUL") => void;
  feedbackSent: ReadonlySet<string>;
  tour: TourState | null;
  /** The element the current step points at, once it has mounted. */
  tourElement: HTMLElement | undefined;
  /** True while a step is navigating or waiting for its target to appear. */
  tourBusy: boolean;
  startTour: (tourId: string) => void;
  moveTour: (index: number) => void;
  endTour: () => void;
  tourPickerOpen: boolean;
  setTourPickerOpen: (open: boolean) => void;
  scrollAnchor: RefObject<HTMLDivElement | null>;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function useCopilotContext(): CopilotContextValue {
  const context = useContext(CopilotContext);
  if (!context) throw new Error("useCopilotContext must be used within CopilotProvider");
  return context;
}

/**
 * Owns the copilot's session/message/tour state exactly once, so the
 * floating panel and the dashboard's docked assistant card share one live
 * conversation instead of each keeping its own disconnected copy.
 */
export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const assistance = useAssistanceRegistry();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<CopilotSession | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tour, setTour] = useState<TourState | null>(null);
  const [tourElement, setTourElement] = useState<HTMLElement | undefined>(undefined);
  const [tourBusy, setTourBusy] = useState(false);
  const [tourPickerOpen, setTourPickerOpen] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<Set<string>>(() => new Set());
  const scrollAnchor = useRef<HTMLDivElement>(null);
  const caseId = useMemo(() => caseIdFromPath(pathname), [pathname]);
  const { roles } = useAuth();
  /** Guards against a slow step resolving after the user has moved on. */
  const tourRun = useRef(0);

  async function ensureSession(): Promise<CopilotSession> {
    if (session) return session;
    const stored = typeof window === "undefined" ? null : window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      try {
        const history = await api.listCopilotMessages(stored);
        const restored: CopilotSession = {
          copilot_session_id: stored,
          context_case_id: caseId ?? null,
          title: "Application help",
          help_pack_version: history.at(-1)?.citations.at(0)?.help_pack_version ?? "current",
          status: "ACTIVE",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setSession(restored);
        setMessages(history);
        return restored;
      } catch {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
    const created = await api.createCopilotSession(pathname, caseId);
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created.copilot_session_id);
    setSession(created);
    setMessages([]);
    return created;
  }

  async function openCopilot() {
    setOpen(true);
    setError("");
    setLoading(true);
    try {
      await ensureSession();
    } catch (requestError) {
      setError(friendlyError(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function sendQuestion(text: string) {
    const normalized = text.trim();
    if (!normalized || loading) return;
    setQuestion("");
    setError("");
    setLoading(true);
    try {
      const activeSession = await ensureSession();
      setMessages((current) => [
        ...current,
        {
          copilot_message_id: crypto.randomUUID(),
          copilot_session_id: activeSession.copilot_session_id,
          role: "USER",
          content: normalized,
          citations: [],
          ui_actions: [],
          provider: "LOCAL_INPUT",
          model_version: null,
          latency_ms: null,
          error_code: null,
          created_at: new Date().toISOString(),
        },
      ]);
      const response = await api.sendCopilotMessage(
        activeSession.copilot_session_id,
        normalized,
        pathname,
        assistance.context(),
        caseId,
      );
      setMessages((current) => [...current, response]);
      window.requestAnimationFrame(() => scrollAnchor.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (requestError) {
      setError(friendlyError(requestError));
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendQuestion(question);
  }

  function ask(text: string) {
    void sendQuestion(text);
  }

  function endTour() {
    tourRun.current += 1;
    if (tour?.tourId === WELCOME_TOUR_ID && typeof window !== "undefined") {
      window.localStorage.setItem(WELCOME_SEEN_KEY, "seen");
    }
    assistance.clearSpotlight();
    setTour(null);
    setTourElement(undefined);
    setTourBusy(false);
  }

  /**
   * Resolve one step: navigate to its route when needed, wait for the target to
   * mount, then spotlight it. Steps are skipped forward when an optional target
   * never appears, so a data-dependent panel (an unanswered clarification, say)
   * does not dead-end the tour.
   */
  async function resolveStep(state: TourState, index: number, direction: 1 | -1) {
    const run = ++tourRun.current;
    const bounded = Math.max(0, Math.min(index, state.steps.length - 1));
    const step = state.steps[bounded];
    if (!step) return endTour();

    setTour({ ...state, index: bounded });
    setTourBusy(true);
    setTourElement(undefined);

    if (step.route && step.route !== pathname) {
      router.push(step.route);
    }

    const target = await assistance.waitFor(step.targetId);
    if (run !== tourRun.current) return; // superseded by a newer step

    if (!target) {
      const nextIndex = bounded + direction;
      if (step.optional && nextIndex >= 0 && nextIndex < state.steps.length) {
        void resolveStep(state, nextIndex, direction);
        return;
      }
      setError("That part of the app is not available right now, so the tour stopped here.");
      endTour();
      return;
    }

    // `autoClearMs: null` -- the default 10s timeout would drop the highlight
    // while the user is still reading the step.
    assistance.spotlight(step.targetId, { autoClearMs: null });
    setTourElement(target.element);
    setTourBusy(false);
  }

  function startTour(tourId: string) {
    const definition = getTour(tourId);
    if (!definition) return;
    const steps = stepsForRoles(definition, roles);
    if (steps.length === 0) {
      setError("No steps in that tour are available for your role.");
      return;
    }
    setError("");
    setTourPickerOpen(false);
    setOpen(false);
    const state: TourState = { tourId, index: 0, steps };
    void resolveStep(state, 0, 1);
  }

  function moveTour(index: number) {
    if (!tour) return;
    if (index >= tour.steps.length) return endTour();
    void resolveStep(tour, index, index < tour.index ? -1 : 1);
  }

  /**
   * Run the welcome tour once for a new user. Deferred out of the effect body
   * so the dashboard's targets have mounted, which keeps the first step from
   * starting against a half-rendered page.
   */
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || pathname !== "/" || roles.size === 0) return;
    if (window.localStorage.getItem(WELCOME_SEEN_KEY)) return;
    autoStarted.current = true;
    const timer = window.setTimeout(() => startTourRef.current(WELCOME_TOUR_ID), 600);
    return () => window.clearTimeout(timer);
  }, [pathname, roles]);

  // Held in a ref so the effect above does not have to depend on a function
  // that is recreated every render.
  const startTourRef = useRef(startTour);
  startTourRef.current = startTour;

  function runAction(action: CopilotMessage["ui_actions"][number]) {
    setError("");
    if (action.action_type === "NAVIGATE") {
      router.push(action.target);
      return;
    }
    if (action.action_type === "SPOTLIGHT") {
      if (!assistance.spotlight(action.target)) {
        setError("That control is not visible in the current screen state.");
        return;
      }
      setOpen(false);
      return;
    }
    if (action.action_type === "START_TOUR") {
      // A concrete catalog id runs that tour; anything else (including the
      // quick action's placeholder) opens the picker so the user chooses.
      if (getTour(action.target)) {
        startTour(action.target);
      } else {
        setOpen(false);
        setTourPickerOpen(true);
      }
      return;
    }
    if (action.action_type === "OPEN_PANEL") {
      // The notification bell is now global (mounted in the top nav on every
      // route), so opening its panel no longer needs to navigate home first.
      if (action.target === "notifications") {
        window.dispatchEvent(new CustomEvent("neurox:open-panel", { detail: { panel: "notifications" } }));
      }
      return;
    }
    window.dispatchEvent(new CustomEvent("neurox:set-filter", { detail: { target: action.target } }));
  }

  async function sendFeedback(messageId: string, rating: "HELPFUL" | "NOT_HELPFUL") {
    if (feedbackSent.has(messageId)) return;
    setError("");
    try {
      await api.sendCopilotFeedback(messageId, rating);
      setFeedbackSent((current) => new Set(current).add(messageId));
    } catch (requestError) {
      setError(friendlyError(requestError));
    }
  }

  const value: CopilotContextValue = {
    open,
    setOpen,
    openCopilot: () => void openCopilot(),
    messages,
    question,
    setQuestion,
    loading,
    error,
    submit,
    ask,
    runAction,
    sendFeedback: (id, rating) => void sendFeedback(id, rating),
    feedbackSent,
    tour,
    tourElement,
    tourBusy,
    startTour,
    moveTour,
    endTour,
    tourPickerOpen,
    setTourPickerOpen,
    scrollAnchor,
  };

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}
