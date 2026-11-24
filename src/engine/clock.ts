/**
 * The engine never calls `new Date()` directly: it asks a Clock.
 * Production uses the system clock; tests and the week simulation use a
 * FakeClock they can move forward minute by minute.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export class FakeClock implements Clock {
  private t: number;
  constructor(start: Date | string) {
    this.t = new Date(start).getTime();
  }
  now(): Date {
    return new Date(this.t);
  }
  set(to: Date | string): void {
    this.t = new Date(to).getTime();
  }
  advanceMinutes(minutes: number): void {
    this.t += minutes * 60_000;
  }
  advanceSeconds(seconds: number): void {
    this.t += seconds * 1000;
  }
}
