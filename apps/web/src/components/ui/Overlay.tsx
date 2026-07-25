"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Overlay({
  onClose,
  labelledBy,
  align = "center",
  children,
  dismissOnBackdrop = false,
}: {
  onClose: () => void;
  labelledBy: string;
  align?: "center" | "bottom";
  children: ReactNode;
  dismissOnBackdrop?: boolean;
}) {
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    surface.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const root = surface.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-void/80 p-4 backdrop-blur-[3px] ${
        align === "center" ? "items-center" : "items-end"
      }`}
      onClick={dismissOnBackdrop ? onClose : undefined}
    >
      <div
        ref={surface}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-full min-h-0 w-full outline-none"
        style={{ maxWidth: align === "bottom" ? "1180px" : "780px" }}
      >
        {children}
      </div>
    </div>
  );
}
