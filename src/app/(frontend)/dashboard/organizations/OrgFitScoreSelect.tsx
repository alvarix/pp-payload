"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

const FIT_SCORES = [
  { value: "",             label: "—" },
  { value: "top_tier",     label: "Top Tier" },
  { value: "strong",       label: "Strong" },
  { value: "worth_trying", label: "Worth Trying" },
];

/**
 * Inline select for changing an organization's fit score from the dashboard.
 */
export function OrgFitScoreSelect({ orgId, currentFitScore }: { orgId: number; currentFitScore: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleChange(next: string) {
    const value = next === "" ? null : next;
    if (value === (currentFitScore ?? null)) return;
    try {
      const res = await fetch("/api/dashboard/org-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, action: "set_fit_score", fitScore: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Org fitScore change failed:", data);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Org fitScore change error:", e);
    }
  }

  return (
    <select
      value={currentFitScore ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      onClick={(e) => e.preventDefault()}
      disabled={isPending}
      className="text-xs px-1 py-0.5 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-wait"
    >
      {FIT_SCORES.map((s) => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  );
}
