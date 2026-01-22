import React from "react";

/*
  Small avatar with initials & color badge.
  Usage: <Avatar name="Alice" size="sm" />
*/
const COLORS = [
  "bg-red-500",
  "bg-emerald-500",
  "bg-blue-500",
  "bg-yellow-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-violet-500",
];

function initials(name) {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function Avatar({ name, size = "sm", className = "" }) {
  const idx = (name ? name.charCodeAt(0) : 0) % COLORS.length;
  const color = COLORS[idx];
  const sizes = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
  };
  return (
    <div className={`rounded-full flex items-center justify-center text-white font-semibold ${color} ${sizes[size]} ${className}`}>
      {initials(name)}
    </div>
  );
}