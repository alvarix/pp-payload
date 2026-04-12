"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface QuickActionsProps {
  jobId: number;
  currentStatus: string;
}

/** Button definitions per status. */
const BUTTONS: Record<string, { label: string; action: string }[]> = {
  new: [{ label: "Mark Intake Received", action: "mark_intake_received" }],
  intake_received: [{ label: "Start Work", action: "start_work" }],
  in_progress: [
    { label: "Mark Awaiting", action: "mark_awaiting" },
    { label: "Ready to Ship", action: "mark_ready_to_ship" },
  ],
  awaiting_pics_or_payment: [
    { label: "Pics Received", action: "toggle_pics_received" },
    { label: "Ready to Ship", action: "mark_ready_to_ship" },
  ],
  ready_to_ship: [{ label: "Mark Delivered", action: "mark_delivered" }],
};

/**
 * Client component for quick status transitions on job cards.
 * POSTs to /api/dashboard/actions and refreshes the page on success.
 */
export function QuickActions({ jobId, currentStatus }: QuickActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const buttons = BUTTONS[currentStatus] || [];
  if (buttons.length === 0) return null;

  async function handleAction(action: string) {
    try {
      const res = await fetch("/api/dashboard/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error("Action failed:", data);
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      console.error("Action error:", e);
    }
  }

  return (
    <div className="flex gap-1 mt-2 flex-wrap">
      {buttons.map((btn) => (
        <button
          key={btn.action}
          onClick={() => handleAction(btn.action)}
          disabled={isPending}
          className="text-xs px-2 py-1 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-wait"
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
