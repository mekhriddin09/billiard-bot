"use client";

import type { TableStatus } from "@/lib/types";

/** Small corner badge overlaid on the table visual — busy = warning, reserved = bookmark. */
export default function StatusCorner({ status }: { status: TableStatus }) {
  if (status === "active") {
    return (
      <span className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded bg-destructive/85 text-[8px] font-bold text-dark">
        !
      </span>
    );
  }
  if (status === "reserved") {
    return (
      <span className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded bg-warning/85 text-dark">
        <svg width="8" height="8" viewBox="0 0 12 14" fill="currentColor">
          <path d="M1 0h10a1 1 0 0 1 1 1v13l-6-3.4L0 14V1a1 1 0 0 1 1-1Z" />
        </svg>
      </span>
    );
  }
  return null;
}
