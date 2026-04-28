"use client";

import { useState } from "react";

/**
 * Truncated notes preview that toggles to show full text on click.
 * Stops propagation so the parent <a> doesn't navigate.
 */
export function NotesPreview({ notes, maxChars = 60 }: { notes: string; maxChars?: number }) {
  const [open, setOpen] = useState(false);
  const truncated = notes.length > maxChars;
  const preview = truncated ? notes.slice(0, maxChars).trimEnd() + "…" : notes;

  function handleToggle(e: React.MouseEvent) {
    if (!truncated) return;
    e.preventDefault();
    e.stopPropagation();
    setOpen((v) => !v);
  }

  return (
    <div
      onClick={handleToggle}
      className={`text-xs text-gray-600 mt-1 ${truncated ? "cursor-pointer" : ""}`}
      title={truncated && !open ? notes : undefined}
    >
      <span className="text-gray-400">📝 </span>
      {open ? (
        <span className="whitespace-pre-wrap">{notes}</span>
      ) : (
        <span>{preview}</span>
      )}
    </div>
  );
}
