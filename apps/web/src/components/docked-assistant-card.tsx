"use client";

import { MapPin, MessagesSquare, Search, ShieldAlert } from "lucide-react";
import { useAuth } from "@/app/providers";
import { Card } from "@/components/ui/card";
import { MaterialIcon } from "@/components/ui/material-icon";
import { ChatComposer, ChatThread } from "@/components/copilot-chat";
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
 * Always-visible assistant for the dashboard's right rail. Shares
 * CopilotProvider's live conversation and copilot-chat's rendering with the
 * floating panel, so a question asked in either shows up in both looking the
 * same rather than as two different treatments of one thread.
 */
export function DockedAssistantCard() {
  const { displayName } = useAuth();
  const { messages, loading, ask, runAction } = useCopilotContext();
  const isEmpty = messages.length === 0 && !loading;

  return (
    <Card padding="none" className="flex max-h-[42rem] flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--color-border)] px-5 py-4">
        <p className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-ink)]">
          Hi, {displayName}
          <MaterialIcon name="waving_hand" className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
        </p>
        <p className="mt-0.5 text-sm text-[var(--color-muted)]">
          {isEmpty ? "How can I help you?" : "Ask a follow-up below."}
        </p>
      </div>

      {/* Quick actions are a starting point, not permanent furniture: once the
          conversation is underway they would push the transcript out of view,
          so they give way to it. Every entry point stays in the composer. */}
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
        /* `min-h-0` lets this shrink inside the flex column so the transcript
           scrolls rather than stretching the card down the page. */
        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg)] px-4 py-4">
          <ChatThread limit={12} />
        </div>
      )}

      <div className="shrink-0 border-t border-[var(--color-border)] p-3">
        <ChatComposer id="docked-copilot-question" placeholder="Ask something…" />
        <p className="mt-2 px-1 text-[11px] text-[var(--color-muted)]">
          Explains and guides. Cannot progress or approve work.
        </p>
      </div>
    </Card>
  );
}
