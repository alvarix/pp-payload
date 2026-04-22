"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

const ORG_STATUSES = [
  { value: "researched", label: "Researched" },
  { value: "contacted", label: "Contacted" },
  { value: "responded", label: "Responded" },
  { value: "confirmed", label: "Confirmed" },
];

/**
 * Inline select for changing an organization's status from the dashboard.
 * POSTs to /api/dashboard/org-actions and refreshes on success.
 */
export function OrgStatusSelect({ orgId, currentStatus }: { orgId: number; currentStatus: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleChange(newStatus: string) {
    if (newStatus === currentStatus) return;
    try {
      const res = await fetch("/api/dashboard/org-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error("Org status change failed:", data);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("Org status change error:", e);
    }
  }

  return (
    <select
      value={currentStatus}
      onChange={(e) => handleChange(e.target.value)}
      disabled={isPending}
      onClick={(e) => e.preventDefault()}
      className="mt-2 w-full text-xs px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-wait"
    >
      {ORG_STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
