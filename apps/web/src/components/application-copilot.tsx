"use client";

import { useEffect } from "react";
import { Bot, ChevronLeft, ChevronRight, CircleHelp, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ChatComposer, ChatThread } from "@/components/copilot-chat";
import { useCopilotContext } from "@/components/copilot-provider";

const SUGGESTIONS = [
  "How does this agent choose tools?",
  "Show the execution path and latency",
  "What should I do next?",
];

/**
 * Floating launcher + anchored popover, present on every route. Session and
 * conversation state lives in CopilotProvider and the chat surface itself in
 * copilot-chat, so this file is only the shell: launcher, header, and the
 * guided-tour callout.
 */
export function ApplicationCopilot() {
  const {
    open,
    setOpen,
    openCopilot,
    messages,
    loading,
    ask,
    tour,
    tourTarget,
    moveTour,
    endTour,
    scrollAnchor,
  } = useCopilotContext();

  // Escape closes: this is a modal dialog, so keyboard users need an exit that
  // does not depend on locating the close button.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  return (
    <>
      <Button
        type="button"
        variant="primary"
        className="fixed bottom-20 right-5 z-40 gap-2 rounded-full px-5 py-4 shadow-[var(--shadow-accent-lg)] md:bottom-7 md:right-7"
        aria-label="Open Vendrai application copilot"
        aria-expanded={open}
        onClick={openCopilot}
      >
        <Sparkles className="h-5 w-5" aria-hidden="true" />
        <span className="hidden sm:inline">Ask Vendrai</span>
      </Button>

      {open && (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="copilot-title"
          /* Fixed height rather than max-height: the panel should not resize
             under the user every time a message lands. */
          className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-xl)] md:inset-auto md:bottom-7 md:right-7 md:h-[min(38rem,calc(100vh-6rem))] md:w-[26rem]"
        >
          <header className="flex shrink-0 items-center gap-3 bg-[var(--color-ink)] px-4 py-3.5 text-white">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-secondary)]">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="copilot-title" className="truncate text-sm font-bold">
                Vendrai copilot
              </h2>
              <p className="truncate text-xs text-white/60">
                Explains and guides. Cannot approve work.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close copilot"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          {/* `min-h-0` is load-bearing: a flex child defaults to
              min-height:auto, so without it this list refuses to shrink below
              its content and pushes the composer past the panel edge instead
              of scrolling. */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg)] px-4 py-4">
            {messages.length === 0 && !loading && (
              <div className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <CircleHelp className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
                  What would you like to understand?
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {SUGGESTIONS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      /* Sends immediately -- filling the box and making the
                         user press send again is a pointless second step. */
                      onClick={() => ask(prompt)}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2.5 text-left text-xs font-medium text-[var(--color-ink)] transition-all duration-200 hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/5"
                    >
                      {prompt}
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted)]" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <ChatThread anchorRef={scrollAnchor} />
          </div>

          <ChatComposer
            id="copilot-question"
            autoFocus
            showHint
            className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3"
          />
        </section>
      )}

      {tour && tourTarget && (
        <aside
          role="dialog"
          aria-label="Guided application tour"
          className="fixed bottom-4 left-1/2 z-[70] w-[min(94vw,560px)] -translate-x-1/2 rounded-2xl bg-[var(--color-ink)] p-5 text-white shadow-[var(--shadow-xl)]"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--color-accent-secondary)]">
              Guided workflow
            </span>
            <span className="text-[11px] text-white/50">
              step {tour.index + 1} of {tour.targetIds.length}
            </span>
          </div>
          <p className="mt-2 font-bold">{tourTarget.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-white/70">{tourTarget.description}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="rounded-xl px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              onClick={endTour}
            >
              Skip tour
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={tour.index === 0}
                className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white/10 disabled:opacity-40"
                onClick={() => moveTour(tour.index - 1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-[var(--color-accent-dark)] to-[var(--color-accent)] px-4 py-2 text-sm font-bold transition-all duration-200 hover:brightness-110"
                onClick={() => (tour.index === tour.targetIds.length - 1 ? endTour() : moveTour(tour.index + 1))}
              >
                {tour.index === tour.targetIds.length - 1 ? "Finish" : "Next"}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
