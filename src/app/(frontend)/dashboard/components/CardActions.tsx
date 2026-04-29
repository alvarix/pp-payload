"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Props = {
  endpoint: string;
  idField: "orgId" | "jobId";
  id: number;
  pinned?: boolean | null;
  label?: string;
};

/**
 * Pin (toggle) and Delete (with confirm) actions for dashboard cards.
 * POSTs to the given endpoint with `{ [idField]: id, action }`.
 */
export function CardActions({ endpoint, idField, id, pinned, label }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function send(action: "toggle_pinned" | "delete") {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [idField]: id, action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error(`${action} failed:`, data);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      console.error(`${action} error:`, e);
    }
  }

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(`Delete ${label ?? "this item"}? This cannot be undone.`);
    if (!ok) return;
    void send("delete");
  }

  function handlePin(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    void send("toggle_pinned");
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handlePin}
        disabled={isPending}
        title={pinned ? "Unpin" : "Pin"}
        className={`text-xs px-2 py-1 rounded border ${
          pinned
            ? "bg-rose-100 text-rose-700 border-rose-300"
            : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
        } disabled:opacity-50`}
      >
        {pinned ? "★" : "☆"}
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        title="Delete"
        className="text-xs px-2 py-1 rounded border bg-white text-gray-500 border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
      >
        ×
      </button>
    </div>
  );
}
