"use client";

import { useLayoutEffect, useState } from "react";
import { OrgStatusSelect } from "./OrgStatusSelect";
import { OrgFitScoreSelect } from "./OrgFitScoreSelect";
import { CardActions } from "../components/CardActions";

export type OrgContact = {
  contactName?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
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
  contactNotes?: string | null;
  contacts?: OrgContact[] | null;
  fitScore?: string | null;
  pinned?: boolean | null;
  followUpDate?: string | null;
  status: string;
  state?: string | null;
};

export type OrgColumnData = {
  key: string;
  label: string;
  color: string;
  isBand?: boolean;
  orgs: OrgForCard[];
};

const BORDER: Record<string, string> = {
  green:  "border-green-400",
  teal:   "border-teal-400",
  gray:   "border-gray-300",
  blue:   "border-blue-400",
  yellow: "border-yellow-400",
  orange: "border-orange-400",
  purple: "border-purple-400",
  amber:  "border-amber-400",
  rose:   "border-rose-400",
  slate:  "border-slate-300",
};

const BADGE: Record<string, string> = {
  green:  "bg-green-100 text-green-700",
  teal:   "bg-teal-100 text-teal-700",
  gray:   "bg-gray-100 text-gray-600",
  blue:   "bg-blue-100 text-blue-700",
  yellow: "bg-yellow-100 text-yellow-700",
  orange: "bg-orange-100 text-orange-700",
  purple: "bg-purple-100 text-purple-700",
  amber:  "bg-amber-100 text-amber-800",
  rose:   "bg-rose-100 text-rose-700",
  slate:  "bg-slate-100 text-slate-600",
};

const BAND_RING: Record<string, string> = {
  amber:  "ring-amber-300",
  purple: "ring-purple-300",
  rose:   "ring-rose-300",
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
  const [topTierTab, setTopTierTab] = useState("NY");

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

  const bands = sorted.filter((c) => c.isBand);
  const regularCols = sorted.filter((c) => !c.isBand);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {bands.map((band) => {
        if (band.key === "top_tier") {
          const byState: Record<string, OrgForCard[]> = {};
          for (const org of band.orgs) {
            const s = org.state ?? "NY";
            if (!byState[s]) byState[s] = [];
            byState[s].push(org);
          }
          const tabs = Object.keys(byState).sort((a, b) =>
            a === "NY" ? -1 : b === "NY" ? 1 : a.localeCompare(b)
          );
          const activeTab = tabs.includes(topTierTab) ? topTierTab : (tabs[0] ?? "NY");
          const stateLabel = (s: string) => s === "NY" ? "NYC" : s;

          return (
            <details key={band.key}>
              <summary className="flex items-center gap-2 mb-2 cursor-pointer list-none select-none">
                <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${BADGE[band.color]} ring-1 ${BAND_RING[band.color] ?? "ring-gray-300"}`}>
                  {band.label}
                </span>
                <span className="text-xs text-gray-400">{band.orgs.length}</span>
              </summary>
              <div className="flex gap-2 mb-2">
                {tabs.map((s) => (
                  <button
                    key={s}
                    onClick={() => setTopTierTab(s)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      activeTab === s
                        ? "bg-amber-100 border-amber-400 text-amber-800 font-semibold"
                        : "bg-white border-gray-200 text-gray-500 hover:border-amber-300"
                    }`}
                  >
                    {stateLabel(s)}
                    <span className="ml-1 text-gray-400">{byState[s].length}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {(byState[activeTab] ?? []).map((org) => (
                  <div key={org.id} className={`flex items-center gap-2 bg-white border ${BORDER[band.color]} rounded-lg px-3 py-1.5 shadow-sm`}>
                    <a
                      href={`/admin/collections/organizations/${org.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-gray-900 hover:text-blue-700 whitespace-nowrap"
                    >
                      {org.name}
                    </a>
                    <OrgStatusSelect orgId={org.id} currentStatus={org.status} compact />
                    <CardActions
                      endpoint="/api/dashboard/org-actions"
                      idField="orgId"
                      id={org.id}
                      pinned={org.pinned ?? false}
                      label={org.name}
                    />
                  </div>
                ))}
                {(byState[activeTab] ?? []).length === 0 && (
                  <p className="text-xs text-gray-400 italic">None</p>
                )}
              </div>
            </details>
          );
        }

        return (
          <details key={band.key}>
            <summary className="flex items-center gap-2 mb-2 cursor-pointer list-none select-none">
              <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${BADGE[band.color]} ring-1 ${BAND_RING[band.color] ?? "ring-gray-300"}`}>
                {band.label}
              </span>
              <span className="text-xs text-gray-400">{band.orgs.length}</span>
            </summary>
            <div className="flex flex-wrap gap-2">
              {band.orgs.map((org) => (
                <div key={org.id} className={`flex items-center gap-2 bg-white border ${BORDER[band.color]} rounded-lg px-3 py-1.5 shadow-sm`}>
                  <a
                    href={`/admin/collections/organizations/${org.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-900 hover:text-blue-700 whitespace-nowrap"
                  >
                    {org.name}
                  </a>
                  <OrgStatusSelect orgId={org.id} currentStatus={org.status} compact />
                  <CardActions
                    endpoint="/api/dashboard/org-actions"
                    idField="orgId"
                    id={org.id}
                    pinned={org.pinned ?? false}
                    label={org.name}
                  />
                </div>
              ))}
              {band.orgs.length === 0 && (
                <p className="text-xs text-gray-400 italic">None</p>
              )}
            </div>
          </details>
        );
      })}

      <div className="flex gap-4 overflow-x-auto overflow-y-auto flex-1 min-h-0 pb-4 w-full min-w-0">
        {regularCols.map((col) => {
        const isDragging = dragging === col.key;
        const isOver = dragOver === col.key;

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
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900 leading-tight min-w-0 flex-1">{org.name}</p>
        <CardActions
          endpoint="/api/dashboard/org-actions"
          idField="orgId"
          id={org.id}
          pinned={org.pinned ?? false}
          label={org.name}
        />
      </div>
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
      {org.contactNotes && (
        <p className="text-xs text-gray-500 mt-0.5 italic whitespace-pre-wrap">{org.contactNotes}</p>
      )}
      {org.contacts && org.contacts.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {org.contacts.map((c, i) => (
            <div key={i} className="text-xs text-gray-500 truncate">
              {c.contactName && <span className="font-medium">{c.contactName}</span>}
              {c.role && <span className="text-gray-400"> · {c.role}</span>}
              {c.email && <span className="block truncate">{c.email}</span>}
              {c.phone && <span className="block text-gray-400">{c.phone}</span>}
              {c.notes && <span className="block text-gray-500 italic whitespace-pre-wrap">{c.notes}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="mt-1">
        <OrgFitScoreSelect orgId={org.id} currentFitScore={org.fitScore ?? null} />
      </div>
      {org.followUpDate && (
        <p className={`text-xs mt-1 ${overdue ? "text-red-600 font-semibold" : "text-gray-400"}`}>
          Follow-up: {org.followUpDate.slice(0, 10)}
        </p>
      )}
      <OrgStatusSelect orgId={org.id} currentStatus={org.status} />
    </a>
  );
}
