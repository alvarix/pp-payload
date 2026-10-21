"use client";

import { useEffect, useRef } from "react";

/**
 * Starts the CSV download as soon as the export page mounts.
 *
 * Browsers allow a same-origin download triggered during page load, but Safari
 * sometimes suppresses it. The page always shows a manual download button as
 * well, so a blocked auto-download costs one click rather than a dead end.
 *
 * @param href - the CSV endpoint URL, including any filter parameter
 */
export function AutoDownload({ href }: { href: string }) {
	const started = useRef(false);

	useEffect(() => {
		// React 18+ development mode mounts effects twice; download once.
		if (started.current) return;
		started.current = true;

		const anchor = document.createElement("a");
		anchor.href = href;
		anchor.download = "";
		anchor.style.display = "none";
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
	}, [href]);

	return null;
}
