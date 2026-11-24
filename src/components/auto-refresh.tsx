"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-render the page from the server every few seconds (demo: watch a call finish). */
export function AutoRefresh({
  seconds = 5,
  maxTimes = 12,
}: {
  seconds?: number;
  maxTimes?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      n++;
      router.refresh();
      if (n >= maxTimes) clearInterval(id);
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds, maxTimes]);
  return null;
}
