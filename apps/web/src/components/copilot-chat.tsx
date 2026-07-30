"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  BookOpen,
  Bot,
  ChevronRight,
  Compass,
  Crosshair,
  ExternalLink,
  MapPin,
  RotateCcw,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import { MaterialIcon } from "@/components/ui/material-icon";
import { useCopilotContext } from "@/components/copilot-provider";

/**
 * The chat surface, shared by the floating copilot panel and the dashboard's
 * docked assistant card. Both render the *same* conversation out of
 * CopilotProvider, so keeping one implementation is what stops the two from
 * drifting into different-looking views of identical data.
 */

const COMPOSER_MAX_HEIGHT = 128;

/** Blank line or more: answers arrive as prose, so render paragraphs as such. */
const PARAGRAPH_BREAK = /\n{2,}/;

/** Signals what a suggested action will actually do before it is clicked. */
const ACTION_ICON: Record<string, typeof MapPin> = {
  SPOTLIGHT: Crosshair,
  NAVIGATE: ExternalLink,
  START_TOUR: Compass,
  OPEN_PANEL: MapPin,
};

/** Activity indicator that signals work without implying measurable progress. */
export function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-muted)]"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function AssistantAvatar() {
  return (
    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
      <Bot className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

export interface ChatThreadProps {
  /**
   * Where to scroll on new messages. The provider owns a single anchor ref, so
   * when both surfaces are mounted at once only one can hold it -- the panel
   * takes it and the docked card passes its own.
   */
  anchorRef?: RefObject<HTMLDivElement | null>;
  limit?: number;
  className?: string;
}

export function ChatThread({ anchorRef, limit = 20, className }: ChatThreadProps) {
  const { messages, loading, error, openCopilot, runAction, sendFeedback, feedbackSent } = useCopilotContext();
  const localAnchor = useRef<HTMLDivElement>(null);
  const anchor = anchorRef ?? localAnchor;

  // Surfaces that do not hold the provider's anchor still need to follow the
  // conversation, so keep the tail in view locally.
  useEffect(() => {
    if (anchorRef) return;
    localAnchor.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading, anchorRef]);

  const visible = messages.slice(-limit);

  return (
    <div className={`flex flex-col gap-4 ${className ?? ""}`}>
      {visible.map((message) =>
        message.role === "USER" ? (
          <div key={message.copilot_message_id} className="flex justify-end">
            <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-[var(--color-accent-dark)] to-[var(--color-accent)] px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-[var(--shadow-xs)]">
              {message.content}
            </p>
          </div>
        ) : (
          <article key={message.copilot_message_id} className="flex gap-2.5">
            <AssistantAvatar />
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 shadow-[var(--shadow-xs)]">
              <div className="space-y-2.5 text-[13.5px] leading-[1.65] text-[var(--color-ink)]">
                {message.content
                  .split(PARAGRAPH_BREAK)
                  .map((para) => para.trim())
                  .filter(Boolean)
                  .map((para, i) => (
                    <p key={i} className="whitespace-pre-wrap">
                      {para}
                    </p>
                  ))}
              </div>

              {message.citations.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-[var(--color-muted)]">Sources</span>
                  {message.citations.map((citation, i) => (
                    <span
                      key={`${citation.title}-${i}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[11px] text-[var(--color-muted)]"
                    >
                      <BookOpen className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {citation.title}
                    </span>
                  ))}
                </div>
              )}

              {message.ui_actions.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[11px] font-medium text-[var(--color-muted)]">Take me there</p>
                  {message.ui_actions.map((action) => {
                    const Icon = ACTION_ICON[action.action_type] ?? MapPin;
                    return (
                      <button
                        key={`${action.action_type}-${action.target}`}
                        type="button"
                        className="group flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/5 px-3 py-2.5 text-left text-xs font-bold text-[var(--color-accent-dark)] transition-all duration-200 hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-accent)]/10"
                        onClick={() => runAction(action)}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">{action.label}</span>
                        </span>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Provenance matters for trust but is not the answer, so it sits
                  below a divider in muted text rather than shouting in caps. */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2.5">
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
                  <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {message.provider === "GEMINI" ? "Gemini + CAG" : "Local CAG"}
                  {message.latency_ms !== null && <span>· {message.latency_ms} ms</span>}
                </span>
                <span className="flex items-center gap-0.5">
                  {feedbackSent.has(message.copilot_message_id) ? (
                    <span className="text-[11px] text-[var(--color-muted)]">Thanks for the feedback</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-label="Mark answer helpful"
                        className="rounded-lg p-1.5 text-[var(--color-muted)] transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                        onClick={() => sendFeedback(message.copilot_message_id, "HELPFUL")}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Mark answer not helpful"
                        className="rounded-lg p-1.5 text-[var(--color-muted)] transition-colors hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => sendFeedback(message.copilot_message_id, "NOT_HELPFUL")}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </span>
              </div>

              {message.error_code && (
                <p className="mt-2 text-[11px] text-amber-700">
                  Degraded: {message.error_code.replaceAll("_", " ").toLowerCase()}
                </p>
              )}
            </div>
          </article>
        ),
      )}

      {loading && (
        <div className="flex gap-2.5" aria-live="polite">
          <AssistantAvatar />
          <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3">
            <TypingDots />
            <span className="text-xs text-[var(--color-muted)]">Assembling permitted context…</span>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <p>{error}</p>
          {error.includes("not reachable") && (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-rose-100 px-2.5 py-1.5 text-xs font-bold transition-colors hover:bg-rose-200"
              onClick={openCopilot}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry connection
            </button>
          )}
        </div>
      )}

      <div ref={anchor} />
    </div>
  );
}

export interface ChatComposerProps {
  id: string;
  placeholder?: string;
  /** Renders the Enter/Shift+Enter hint. Off in tight surfaces like the card. */
  showHint?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export function ChatComposer({
  id,
  placeholder = "Ask what happened, why, or how to use this screen…",
  showHint = false,
  className,
  autoFocus = false,
}: ChatComposerProps) {
  const { question, setQuestion, loading, submit } = useCopilotContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const canSend = !loading && question.trim().length >= 2;

  // Grow with content up to a cap, then scroll, so a long question stays
  // readable without the composer swallowing the transcript above it.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [question]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  return (
    <form ref={formRef} onSubmit={submit} className={className}>
      <label htmlFor={id} className="sr-only">
        Ask about Vendrai
      </label>
      <div className="flex items-end gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-1.5 transition-colors focus-within:border-[var(--color-accent)] focus-within:bg-[var(--color-surface)]">
        <textarea
          ref={textareaRef}
          id={id}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line -- the convention every
            // chat UI uses. Previously the only way to send was the button.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) formRef.current?.requestSubmit();
            }
          }}
          rows={1}
          maxLength={1200}
          placeholder={placeholder}
          className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm leading-relaxed text-[var(--color-ink)] outline-none placeholder:text-[var(--color-muted)]"
        />
        <button
          type="submit"
          title="Send question"
          aria-label="Send question"
          disabled={!canSend}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-accent-dark)] to-[var(--color-accent)] text-white shadow-[var(--shadow-xs)] transition-all duration-200 hover:brightness-110 disabled:bg-none disabled:bg-[var(--color-border-strong)] disabled:shadow-none"
        >
          <MaterialIcon name="send" className="h-4 w-4" />
        </button>
      </div>
      {showHint && (
        <p className="mt-2 px-1 text-[11px] text-[var(--color-muted)]">
          <kbd className="font-mono">Enter</kbd> to send ·{" "}
          <kbd className="font-mono">Shift</kbd>+<kbd className="font-mono">Enter</kbd> for a new line
        </p>
      )}
    </form>
  );
}
