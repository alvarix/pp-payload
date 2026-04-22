"use client";

import { useLayoutEffect, useState } from "react";
import { OrgStatusSelect } from "./OrgStatusSelect";

export type OrgContact = {
  contactName?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type OrgForCard = {
  id: number;
  name: string;
  type?: string | null;
  neighborhood?: string | null;
  instagram?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  contacts?: OrgContact[] | null;
  fitScore?: string | null;
  followUpDate?: string | null;
  status: string;
};

export type OrgColumnData = {
  key: string;
  label: string;
  color: string;
  isTopTier?: boolean;
  orgs: OrgForCard[];
};

const BORDER: Record<string, string> = {
  green:  "border-green-400",
  teal:   "border-teal-400",
  gray:   "border-gray-300",
  blue:   "border-blue-400",
  yellow: "border-yellow-400",
  purple: "border-purple-400",
  amber:  "border-amber-400",
};

const BADGE: Record<string, string> = {
  green:  "bg-green-100 text-green-700",
  teal:   "bg-teal-100 text-teal-700",
  gray:   "bg-gray-100 text-gray-600",
  blue:   "bg-blue-100 text-blue-700",
  yellow: "bg-yellow-100 text-yellow-700",
  purple: "bg-purple-100 text-purple-700",
  amber:  "bg-amber-100 text-amber-800",
};

const LS_KEY = "org-dashboard-col-order";

/**
 * Client wrapper for the org kanban board.
 * Persists column order to localStorage; supports drag-to-reorder column headers.
 */
export function KanbanColumns({ columns, today }: { columns: OrgColumnData[]; today: string }) {
  const [order, setOrder] = useState<string[]>(() => columns.map((c) => c.key));
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Read saved order before first paint to avoid flash
  useLayoutEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "null") as string[] | null;
      if (!saved) return;
      const keys = columns.map((c) => c.key);
      // Only restore if saved order contains exactly the current keys
      if (saved.length === keys.length && keys.every((k) => saved.includes(k))) {
        setOrder(saved);
      }
    } catch {}
  }, []);

  function handleDragStart(key: string) {
    setDragging(key);
  }

  function handleDragOver(e: React.DragEvent, key: string) {
    e.preventDefault();
    if (key !== dragging) setDragOver(key);
  }

  function handleDrop(targetKey: string) {
    if (!dragging || dragging === targetKey) {
      setDragging(null);
      setDragOver(null);
      return;
    }
    const next = [...order];
    const from = next.indexOf(dragging);
    const to = next.indexOf(targetKey);
    next.splice(from, 1);
    next.splice(to, 0, dragging);
    setOrder(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    setDragging(null);
    setDragOver(null);
  }

  const sorted = order.map((key) => columns.find((c) => c.key === key)!).filter(Boolean);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {sorted.map((col) => {
        const isDragging = dragging === col.key;
        const isOver = dragOver === col.key;

        if (col.isTopTier) {
          return (
            <details
              key={col.key}
              open
              className={`flex-shrink-0 w-60 transition-opacity ${isDragging ? "opacity-40" : ""}`}
            >
              <summary
                draggable
                onDragStart={() => handleDragStart(col.key)}
                onDragOver={(e) => handleDragOver(e, col.key)}
                onDrop={() => handleDrop(col.key)}
                onDragEnd={() => { setDragging(null); setDragOver(null); }}
                className={`flex items-center justify-between mb-2 cursor-grab active:cursor-grabbing list-none select-none rounded px-1 -mx-1 ${isOver ? "ring-2 ring-blue-400" : ""}`}
              >
                <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${BADGE.amber} ring-1 ring-amber-300`}>
                  {col.label}
                </span>
                <span className="text-xs text-gray-400">{col.orgs.length}</span>
              </summary>
              <div className="space-y-2">
                {col.orgs.map((org) => (
                  <OrgCard key={org.id} org={org} today={today} borderColor={BORDER.amber} />
                ))}
                {col.orgs.length === 0 && (
                  <p className="text-xs text-gray-400 italic text-center pt-4">None</p>
                )}
              </div>
            </details>
          );
        }

        return (
          <div
            key={col.key}
            className={`flex-shrink-0 w-60 transition-opacity ${isDragging ? "opacity-40" : ""}`}
          >
            <div
              draggable
              onDragStart={() => handleDragStart(col.key)}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDrop={() => handleDrop(col.key)}
              onDragEnd={() => { setDragging(null); setDragOver(null); }}
              className={`flex items-center justify-between mb-2 cursor-grab active:cursor-grabbing select-none rounded px-1 -mx-1 ${isOver ? "ring-2 ring-blue-400" : ""}`}
            >
              <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${BADGE[col.color]}`}>
                {col.label}
              </span>
              <span className="text-xs text-gray-400">{col.orgs.length}</span>
            </div>
            <div className="space-y-2">
              {col.orgs.map((org) => (
                <OrgCard key={org.id} org={org} today={today} borderColor={BORDER[col.color]} />
              ))}
              {col.orgs.length === 0 && (
                <p className="text-xs text-gray-400 italic text-center pt-4">None</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrgCard({
  org,
  today,
  borderColor,
}: {
  org: OrgForCard;
  today: string;
  borderColor: string;
}) {
  const overdue =
    org.followUpDate &&
    org.followUpDate.slice(0, 10) <= today &&
    !["upcoming_event", "ongoing_relationship", "past_collaborator"].includes(org.status);

  return (
    <a
      href={`/admin/collections/organizations/${org.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`block bg-white border ${borderColor} rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow`}
    >
      <p className="text-sm font-medium text-gray-900 leading-tight">{org.name}</p>
      <p className="text-xs text-gray-400 mt-0.5 capitalize">
        {org.type?.replace(/_/g, " ")}
        {org.neighborhood ? ` · ${org.neighborhood}` : ""}
      </p>
      {org.instagram && (
        <p className="text-xs text-blue-500 mt-0.5">@{org.instagram}</p>
      )}
      {org.website && (
        <p className="text-xs text-gray-400 mt-0.5 truncate">{org.website}</p>
      )}
      {org.email && (
        <p className="text-xs text-gray-500 mt-0.5 truncate">{org.email}</p>
      )}
      {org.phone && (
        <p className="text-xs text-gray-400 mt-0.5">{org.phone}</p>
      )}
      {org.contacts && org.contacts.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {org.contacts.map((c, i) => (
            <div key={i} className="text-xs text-gray-500 truncate">
              {c.contactName && <span className="font-medium">{c.contactName}</span>}
              {c.role && <span className="text-gray-400"> · {c.role}</span>}
              {c.email && <span className="block truncate">{c.email}</span>}
              {c.phone && <span className="block text-gray-400">{c.phone}</span>}
            </div>
          ))}
        </div>
      )}
      {org.fitScore && org.fitScore !== "top_tier" && (
        <p className="text-xs text-gray-400 mt-0.5 capitalize">
          {org.fitScore.replace(/_/g, " ")}
        </p>
      )}
      {org.followUpDate && (
        <p className={`text-xs mt-1 ${overdue ? "text-red-600 font-semibold" : "text-gray-400"}`}>
          Follow-up: {org.followUpDate.slice(0, 10)}
        </p>
      )}
      <OrgStatusSelect orgId={org.id} currentStatus={org.status} />
    </a>
  );
}
