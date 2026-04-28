"use client";

import { useState, useEffect } from "react";

export function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggle() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  return (
    <button
      onClick={toggle}
      title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      className="text-xs px-2 py-0.5 border border-gray-200 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
    >
      {isFullscreen ? "⤡" : "⤢"}
    </button>
  );
}
