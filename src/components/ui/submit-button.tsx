"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./button";

/** A submit button that shows progress and can't be double-clicked. */
export function SubmitButton({
  children,
  pendingText = "Saving…",
  variant = "primary",
  size = "lg",
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      variant={variant}
      size={size}
      className={className}
    >
      {pending ? pendingText : children}
    </Button>
  );
}
