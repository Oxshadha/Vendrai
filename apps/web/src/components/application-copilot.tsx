"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, MapPin, MessagesSquare, Search, ShieldAlert, Sparkles, X } from "lucide-react";

import { useAuth } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { MaterialIcon } from "@/components/ui/material-icon";
import { ChatComposer, ChatThread } from "@/components/copilot-chat";
import { CopilotTourList } from "@/components/copilot-tour-list";
import { SpotlightOverlay } from "@/components/spotlight-overlay";
import { TourCallout } from "@/components/tour-callout";
import { useAssistanceTarget } from "@/components/assistance-registry";
import { useCopilotContext } from "@/components/copilot-provider";

const QUICK_ACTIONS = [
  {
    label: "Summarize this queue",
    icon: MessagesSquare,
    color: "bg-emerald-100 text-emerald-700",
    run: (ask: (text: string) => void) => ask("Summarize today's work queue"),
  },
  {
    label: "Explain a status",
    icon: Search,
    // Sky, not blue: brand blue is reserved for the tour action below, and two
    // adjacent blues would stop reading as distinct affordances.
    color: "bg-sky-100 text-sky-700",
    run: (ask: (text: string) => void) => ask("What does DUPLICATE_REVIEW mean?"),
  },
  {
    label: "Find risk cases",
    icon: ShieldAlert,
    color: "bg-amber-100 text-amber-700",
    run: (ask: (text: string) => void) => ask("Which cases have open risk findings?"),
  },
  {
    label: "Guided tour",
    icon: MapPin,
    color: "bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-secondary)] text-white",
    // No concrete tour id: the engine shows the list inside the panel rather
    // than dropping the user into a fixed walkthrough.
    run: (_ask: (text: string) => void, runAction: ReturnType<typeof useCopilotContext>["runAction"]) =>
      runAction({ action_type: "START_TOUR", target: "__list__", label: "Guided tour" }),
  },
];

/**
 * Floating launcher + assistant panel, present on every route. Conversation
 * state lives in CopilotProvider and the thread/composer in copilot-chat; this
 * file is the shell, plus the spotlight overlay and tour callout.
 */
export function ApplicationCopilot() {
  const { displayName } = useAuth();
  const {
    open,
    openCopilot,
    closeCopilot,
    messages,
    loading,
    ask,
    runAction,
    tour,
    spotlightElement,
    tourBusy,
    startTour,
    moveTour,
    endTour,
    view,
    setView,
    scrollAnchor,
  } = useCopilotContext();
  const launcherAssistance = useAssistanceTarget({
    id: "copilot.launcher",
    title: "Vendrai assistant",
    description:
      "Ask what a status means, why an outcome was proposed, or how to use the current screen. It explains and guides but cannot approve work.",
  });
  const reduceMotion = useReducedMotion();
  const step = tour?.steps[tour.index];
  const showQuickActions = view === "chat" && messages.length === 0 && !loading;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape backs out of the tour list first, then closes the panel.
      if (event.key !== "Escape") return;
      if (view === "tours") setView("chat");
      else closeCopilot();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, view, setView, closeCopilot]);

  return (
    <>
      <div {...launcherAssistance} className="fixed bottom-5 right-4 z-40 md:bottom-7 md:right-7">
        <Button
          type="button"
          variant="primary"
          className="gap-2 rounded-full px-5 py-4 shadow-[var(--shadow-accent-lg)]"
          aria-label="Open Vendrai application copilot"
          aria-expanded={open}
          onClick={openCopilot}
        >
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          <span className="hidden sm:inline">Ask Vendrai</span>
        </Button>
      </div>

      {open && (
        <>
          {/*
            The panel is aria-modal, but sat on the page with nothing behind it
            and read as part of the layout rather than above it. A dimmed,
            blurred backdrop separates the two and gives click-away to close.
          */}
          <motion.button
            type="button"
            aria-label="Close copilot"
            tabIndex={-1}
            onClick={closeCopilot}
            className="fixed inset-0 z-40 cursor-default bg-[rgba(15,23,42,0.45)] backdrop-blur-[2px]"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          />

          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="copilot-title"
            /* Fixed height rather than max-height: the panel should not resize
               under the user every time a message lands. */
            className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_60px_rgba(15,23,42,0.28)] md:inset-auto md:bottom-7 md:right-7 md:h-[min(38rem,calc(100vh-6rem))] md:w-[26rem]"
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex shrink-0 items-start gap-3 border-b border-[var(--color-border)] px-5 py-4">
              {view === "tours" && (
                <button
                  type="button"
                  onClick={() => setView("chat")}
                  aria-label="Back to chat"
                  className="mt-0.5 shrink-0 rounded-full p-2 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <h2
                  id="copilot-title"
                  className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-ink)]"
                >
                  {view === "tours" ? (
                    "Guided tours"
                  ) : (
                    <>
                      Hi, {displayName}
                      <MaterialIcon name="waving_hand" className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
                    </>
                  )}
                </h2>
                <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                  {view === "tours"
                    ? "Pick a walkthrough. You can leave at any point."
                    : showQuickActions
                      ? "How can I help you?"
                      : "Ask a follow-up below."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCopilot}
                className="shrink-0 rounded-full p-2 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-ink)]"
                aria-label="Close copilot"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {view === "tours" ? (
              <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg)]">
                <CopilotTourList onSelect={startTour} />
              </div>
            ) : showQuickActions ? (
              <div className="grid grid-cols-2 gap-3 p-5">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => action.run(ask, runAction)}
                    className="group flex flex-col items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-surface)] hover:shadow-[var(--shadow-sm)]"
                  >
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-110 ${action.color}`}
                    >
                      <action.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-bold text-[var(--color-ink)]">{action.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              /* `min-h-0` is load-bearing: a flex child defaults to
                 min-height:auto, so without it the list refuses to shrink below
                 its content and pushes the composer past the panel edge. */
              <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg)] px-4 py-4">
                <ChatThread anchorRef={scrollAnchor} />
              </div>
            )}

            {view === "chat" && (
              <div className="mt-auto shrink-0 border-t border-[var(--color-border)] p-3">
                <ChatComposer id="copilot-question" autoFocus placeholder="Ask something…" />
                <p className="mt-2 px-1 text-[11px] text-[var(--color-muted)]">
                  Explains and guides. Cannot progress or approve work.
                </p>
              </div>
            )}
          </motion.section>
        </>
      )}

      {/* Shared by tour steps and one-off spotlight actions. */}
      <SpotlightOverlay target={spotlightElement} />

      {tour && step && (
        <TourCallout
          target={spotlightElement}
          title={step.title}
          body={step.body}
          index={tour.index}
          total={tour.steps.length}
          busy={tourBusy}
          onBack={() => moveTour(tour.index - 1)}
          onNext={() => moveTour(tour.index + 1)}
          onSkip={endTour}
        />
      )}
    </>
  );
}
