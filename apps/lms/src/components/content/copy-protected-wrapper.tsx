"use client";
import { useEffect, ReactNode } from "react";

interface Props {
  children: ReactNode;
  enabled?: boolean;
}

export function CopyProtectedWrapper({ children, enabled = true }: Props) {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && ["c", "u", "s", "p"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
      if (e.key === "PrintScreen") e.preventDefault();
    };
    const handleContextMenu = (e: Event) => e.preventDefault();
    const handleDragStart = (e: Event) => e.preventDefault();

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("dragstart", handleDragStart);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("dragstart", handleDragStart);
    };
  }, [enabled]);

  if (!enabled) return <>{children}</>;

  return (
    <div
      className="select-none"
      style={{ WebkitUserSelect: "none", userSelect: "none" }}
    >
      {children}
    </div>
  );
}
