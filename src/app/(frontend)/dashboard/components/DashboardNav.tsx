import { FullscreenButton } from "./FullscreenButton";

interface QuickCreate {
  label: string;
  href: string;
}

interface DashboardNavProps {
  /** Which section is currently active: "jobs" | "organizations" */
  section: "jobs" | "organizations";
  /** Badge count for orgs needing follow-up */
  orgsNeedingFollowUp?: number;
  /** Context-specific create actions shown after the section label */
  quickCreate?: QuickCreate[];
  /** Context-specific import link */
  importHref?: string;
}

/**
 * Global navigation bar shared across all dashboard pages.
 * Includes section links, quick-create actions, and a link to the Payload admin panel.
 */
export function DashboardNav({
  section,
  orgsNeedingFollowUp = 0,
  quickCreate = [],
  importHref,
}: DashboardNavProps) {
  const linkCls = "text-xs px-2 py-0.5 border border-gray-200 rounded text-gray-600 hover:bg-gray-100";
  const activeCls = "text-xs px-2 py-0.5 border rounded font-semibold";
  const sectionActive = (s: string) =>
    section === s
      ? `${activeCls} border-gray-800 bg-gray-800 text-white`
      : `${linkCls}`;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-1 flex-shrink-0">
      {/* Section nav */}
      <a href="/dashboard" className={sectionActive("jobs")}>
        Jobs
      </a>

      <a
        href="/dashboard/organizations"
        className={`${sectionActive("organizations")} inline-flex items-center gap-1`}
      >
        Orgs
        {orgsNeedingFollowUp > 0 && (
          <span className="bg-red-500 text-white text-xs px-1 rounded-full leading-none py-0.5">
            {orgsNeedingFollowUp}
          </span>
        )}
      </a>

      <span className="text-gray-300 select-none">|</span>

      {/* Quick-create actions */}
      {quickCreate.map((action) => (
        <a
          key={action.href}
          href={action.href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkCls}
        >
          {action.label}
        </a>
      ))}

      {/* Import */}
      {importHref && (
        <a href={importHref} className={linkCls}>
          Import CSV
        </a>
      )}

      <span className="text-gray-300 select-none">|</span>

      {/* Admin panel */}
      <a
        href="/admin"
        target="_blank"
        rel="noopener noreferrer"
        className={linkCls}
      >
        Admin
      </a>

      <FullscreenButton />
    </div>
  );
}
