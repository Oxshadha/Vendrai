"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleHelp, Send } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAssistanceTarget } from "@/components/assistance-registry";

/**
 * The generated contract type for a question is `{ [key: string]: unknown }`,
 * so nothing caught the frontend reading `field_name`/`text` while the backend
 * (`domain/clarification.py`, `as_dict`) has always emitted `field`/`question`.
 * Both reads were `undefined`, which is why every prompt rendered as the
 * meaningless "Provide answer-0" and the submit button never appeared.
 *
 * The older names are still accepted so a mixed-version API cannot regress this.
 */
interface Question {
  field: string;
  prompt: string;
  reason: string | undefined;
}

function str(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function asQuestion(raw: Record<string, unknown>, index: number): Question {
  const field = str(raw, "field", "field_name") ?? `answer-${index}`;
  return {
    field,
    prompt: str(raw, "question", "text") ?? `Provide ${field.replaceAll("_", " ")}`,
    reason: str(raw, "reason_code")?.toLowerCase().replaceAll("_", " "),
  };
}

/** Fields that hold tabular or multi-line content need room to type. */
const LONG_FORM = new Set(["line_items", "notes", "justification", "description"]);

export function CaseClarification({
  caseId,
  caseVersion,
}: {
  caseId: string;
  caseVersion: number;
}) {
  const queryClient = useQueryClient();
  const assistance = useAssistanceTarget({
    id: "case.clarification",
    title: "Clarification request",
    description:
      "Answer only the missing or contradictory fields requested by the workflow, then resume from the durable checkpoint.",
    tour: "case.review-tour",
    order: 20,
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const tasks = useQuery({
    queryKey: ["clarifications"],
    queryFn: api.listClarifications,
  });
  const task = useMemo(
    () => (tasks.data ?? []).find((item) => item.case_id === caseId),
    [caseId, tasks.data],
  );
  const respond = useMutation({
    mutationFn: () => api.respondToClarification(task!, answers, caseVersion),
    onSuccess: async () => {
      setAnswers({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["clarifications"] }),
        queryClient.invalidateQueries({ queryKey: ["case", caseId] }),
        queryClient.invalidateQueries({ queryKey: ["events", caseId] }),
      ]);
    },
  });
  if (!task) return null;
  const questions = task.questions.map(asQuestion);
  const answerable = questions.filter((question) => question.field && question.field !== "document");

  return (
    <Card {...assistance} tint="warning">
      <div className="mb-5 flex items-center gap-3">
        <CircleHelp className="h-6 w-6 text-amber-800" />
        <div>
          <h2 className="font-display text-xl font-bold">Clarification required</h2>
          <p className="text-sm text-amber-900/80">
            Answer only the requested fields. Sensitive answers are encrypted and masked.
          </p>
        </div>
      </div>
      <div className="space-y-4">
        {questions.map((question, index) => (
          <div key={`${question.field}-${index}`}>
            <label htmlFor={`clarification-${question.field}`} className="mb-1 block text-sm font-bold">
              {question.prompt}
            </label>
            {question.reason && (
              <p className="mb-2 text-xs text-amber-900/70">Reason: {question.reason}</p>
            )}
            {question.field === "document" ? (
              <p className="rounded-xl bg-white p-3 text-sm">
                Upload the requested document from the intake flow, then resubmit.
              </p>
            ) : LONG_FORM.has(question.field) ? (
              <textarea
                id={`clarification-${question.field}`}
                rows={4}
                placeholder="One row per line, e.g. 12 x Widget A @ 45.00"
                value={answers[question.field] ?? ""}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [question.field]: event.target.value }))
                }
                className="w-full rounded-xl border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
              />
            ) : (
              <Input
                id={`clarification-${question.field}`}
                value={answers[question.field] ?? ""}
                onChange={(event) =>
                  setAnswers((current) => ({ ...current, [question.field]: event.target.value }))
                }
              />
            )}
          </div>
        ))}
      </div>
      {respond.isError && (
        <p role="alert" className="mt-4 text-sm text-rose-900">
          {respond.error.message}
        </p>
      )}
      {answerable.length > 0 && (
        <Button
          type="button"
          variant="primary"
          className="mt-5 gap-2"
          disabled={
            respond.isPending
            || answerable.some((question) => !answers[question.field]?.trim())
          }
          onClick={() => respond.mutate()}
        >
          <Send className="h-4 w-4" /> Submit clarification
        </Button>
      )}
    </Card>
  );
}
