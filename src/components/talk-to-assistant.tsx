"use client";

import { Conversation } from "@elevenlabs/client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Line = { who: "assistant" | "you"; text: string };

/**
 * Talk to the real voice assistant in the browser (uses the microphone).
 * Docs: https://elevenlabs.io/docs/eleven-agents/libraries/java-script
 */
export function TalkToAssistant({ assistantName }: { assistantName: string }) {
  const conv = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "ended" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  async function start() {
    setError(null);
    setLines([]);
    setStatus("connecting");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const res = await fetch("/api/voice/session", { method: "POST" });
      if (!res.ok) throw new Error("The voice service isn't available right now.");
      const { signedUrl, dynamicVariables } = (await res.json()) as {
        signedUrl: string;
        dynamicVariables: Record<string, string | number | boolean>;
      };
      conv.current = await Conversation.startSession({
        signedUrl,
        dynamicVariables,
        onConnect: () => setStatus("connected"),
        onDisconnect: () => setStatus("ended"),
        onError: (message: string) => {
          setError(message);
          setStatus("error");
        },
        onMessage: ({ message, role }) =>
          setLines((l) => [...l, { who: role === "user" ? "you" : "assistant", text: message }]),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start. Please allow microphone access.");
      setStatus("error");
    }
  }

  async function stop() {
    await conv.current?.endSession();
    conv.current = null;
    setStatus("ended");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {status === "connected" || status === "connecting" ? (
          <Button onClick={stop} variant="danger">
            End conversation
          </Button>
        ) : (
          <Button onClick={start}>Talk to {assistantName}</Button>
        )}
        <span className="text-sm text-muted" role="status">
          {status === "connecting" && "Connecting…"}
          {status === "connected" && "Connected: speak in Hindi, Hinglish or English."}
          {status === "ended" && "Conversation ended."}
        </span>
      </div>
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
      {lines.length > 0 && (
        <ol className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-xl bg-foreground/5 p-3">
          {lines.map((l, i) => (
            <li
              key={i}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-base ${l.who === "assistant" ? "self-start bg-surface" : "self-end bg-primary/10"}`}
            >
              {l.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
