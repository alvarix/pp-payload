"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface QuickActionsProps {
  jobId: number;
  currentStatus: string;
}

const ALL_STATUSES = [
  { value: "inquiry", label: "Inquiry" },
  { value: "intake_received", label: "Intake Received" },
  { value: "in_progress", label: "In Progress" },
  { value: "awaiting_pics_or_payment", label: "Awaiting Pics/Payment" },
  { value: "ready_to_ship", label: "Ready to Ship" },
  { value: "delivered", label: "Delivered" },
  { value: "portfolio_ready", label: "Portfolio Ready" },
];

/**
 * Client component for changing job status via a select dropdown.
 * POSTs set_status to /api/dashboard/actions and refreshes on success.
 */
export function QuickActions({ jobId, currentStatus }: QuickActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleChange(newStatus: string) {
    if (newStatus === currentStatus) return;
    try {
      const res = await fetch("/api/dashboard/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action: "set_status", status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error("Status change failed:", data);
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      console.error("Status change error:", e);
    }
  }

  return (
    <div className="mt-2">
      <select
        value={currentStatus}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="w-full text-xs px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-wait"
      >
        {ALL_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
