import React from "react";

/*
  Subtle red overlay for losses (per-player POV).
*/
export default function RedOverlay({ show }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 bg-red-600 bg-opacity-30 backdrop-blur-sm"></div>
  );
}