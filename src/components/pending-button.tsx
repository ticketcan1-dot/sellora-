"use client";
import { useFormStatus } from "react-dom";
export function PendingButton({
  children,
  className = "btn",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}>
      {pending ? "En cours…" : children}
    </button>
  );
}
