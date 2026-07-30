"use client";

import { useEffect } from "react";
import { MapPin, MessagesSquare, Search, ShieldAlert, Sparkles, X } from "lucide-react";

import { useAuth } from "@/app/providers";
import { Button } from "@/components/ui/button";
import { MaterialIcon } from "@/components/ui/material-icon";
import { ChatComposer, ChatThread } from "@/components/copilot-chat";
import { TourCallout } from "@/components/tour-callout";
import { TourPicker } from "@/components/tour-picker";
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
    // No concrete tour id: the engine opens the picker so the user chooses
    // which walkthrough to run rather than being dropped into a fixed one.
    run: (_ask: (text: string) => void, runAction: ReturnType<typeof useCopilotContext>["runAction"]) =>
      runAction({ action_type: "START_TOUR", target: "__picker__", label: "Guided tour" }),
  },
];

/**
 * Floating launcher + assistant panel, present on every route.
 *
 * This is now the only assistant surface: the dashboard's docked card used the
 * same conversation and rendering, so keeping both meant maintaining two shells
 * around identical state. The panel adopts the card's lighter treatment --
 * greeting, quick-action grid, then the transcript once one exists.
 *
 * Conversation state lives in CopilotProvider and the thread/composer in
 * copilot-chat; this file is the shell, plus the tour callout and picker.
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
    tourElement,
    tourBusy,
    startTour,
    moveTour,
    endTour,
    tourPickerOpen,
    setTourPickerOpen,
    scrollAnchor,
  } = useCopilotContext();
  const launcherAssistance = useAssistanceTarget({
    id: "copilot.launcher",
    title: "Vendrai assistant",
    description:
      "Ask what a status means, why an outcome was proposed, or how to use the current screen. It explains and guides but cannot approve work.",
  });
  const step = tour?.steps[tour.index];
  const isEmpty = messages.length === 0 && !loading;

  // Escape closes: this is a modal dialog, so keyboard users need an exit that
  // does not depend on locating the close button. Both exits clear the thread.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCopilot();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeCopilot]);

  return (
    <>
      <div {...launcherAssistance} className="fixed bottom-20 right-5 z-40 md:bottom-7 md:right-7">
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
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="copilot-title"
          /* Fixed height rather than max-height: the panel should not resize
             under the user every time a message lands. */
          className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-xl)] md:inset-auto md:bottom-7 md:right-7 md:h-[min(38rem,calc(100vh-6rem))] md:w-[26rem]"
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-[var(--color-border)] px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2
                id="copilot-title"
                className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-ink)]"
              >
                Hi, {displayName}
                <MaterialIcon name="waving_hand" className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              </h2>
              <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                {isEmpty ? "How can I help you?" : "Ask a follow-up below."}
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

          {/* Quick actions are a starting point, not permanent furniture: once
              the conversation is underway they would push the transcript out of
              view, so they give way to it. Every entry point stays in the
              composer.

              `min-h-0` on the transcript is load-bearing: a flex child defaults
              to min-height:auto, so without it the list refuses to shrink below
              its content and pushes the composer past the panel edge. */}
          {isEmpty ? (
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
            <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg)] px-4 py-4">
              <ChatThread anchorRef={scrollAnchor} />
            </div>
          )}

          <div className="mt-auto shrink-0 border-t border-[var(--color-border)] p-3">
            <ChatComposer id="copilot-question" autoFocus placeholder="Ask something…" />
            <p className="mt-2 px-1 text-[11px] text-[var(--color-muted)]">
              Explains and guides. Cannot progress or approve work.
            </p>
          </div>
        </section>
      )}

      {tourPickerOpen && (
        <TourPicker onSelect={startTour} onClose={() => setTourPickerOpen(false)} />
      )}

      {tour && step && (
        <TourCallout
          target={tourElement}
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
