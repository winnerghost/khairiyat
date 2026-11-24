import { describe, expect, it } from "vitest";
import { createLogger, maskPhone, redact } from "./logger";

function collect() {
  const lines: Record<string, unknown>[] = [];
  const log = createLogger(
    { svc: "test" },
    {
      level: "debug",
      sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
      now: () => new Date("2026-11-24T04:00:00.000Z"),
    },
  );
  return { log, lines };
}

describe("logger", () => {
  it("writes one JSON object per line with bindings", () => {
    const { log, lines } = collect();
    log.info("tick finished", { dialed: 3 });
    expect(lines).toEqual([
      {
        level: "info",
        time: "2026-11-24T04:00:00.000Z",
        msg: "tick finished",
        svc: "test",
        dialed: 3,
      },
    ]);
  });

  it("never prints sensitive fields", () => {
    const { log, lines } = collect();
    log.info("calling", {
      phone: "+919876543210",
      to_number: "+919876543210",
      email: "son@example.com",
      transcript: [{ role: "user", message: "seene mein dard" }],
      healthNotes: "diabetes",
      apiKey: "secret",
      nested: { authorization: "Bearer x", ok: true },
    });
    const line = lines[0]!;
    expect(line.phone).toBe("[redacted]");
    expect(line.to_number).toBe("[redacted]");
    expect(line.email).toBe("[redacted]");
    expect(line.transcript).toBe("[redacted]");
    expect(line.healthNotes).toBe("[redacted]");
    expect(line.apiKey).toBe("[redacted]");
    expect(line.nested).toEqual({ authorization: "[redacted]", ok: true });
  });

  it("masks phone numbers inside messages", () => {
    const { log, lines } = collect();
    log.warn("dial failed for +91 98765 43210");
    expect(lines[0]!.msg).toBe("dial failed for ***210");
  });

  it("respects the minimum level and child bindings", () => {
    const lines: string[] = [];
    const log = createLogger({}, { level: "warn", sink: (l) => lines.push(l) });
    log.info("hidden");
    log.child({ parentId: "p1" }).error("shown");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: "error", parentId: "p1" });
  });
});

describe("maskPhone / redact", () => {
  it("leaves dates and short numbers alone", () => {
    expect(maskPhone("on 2026-11-24 at 09:15, retry 2")).toBe("on 2026-11-24 at 09:15, retry 2");
  });

  it("serialises errors without leaking phone numbers", () => {
    const out = redact(new Error("busy: +919876543210")) as { message: string };
    expect(out.message).toBe("busy: ***210");
  });
});
