import { readFileSync, existsSync } from "fs";
import { join } from "path";

export type CallerSnapshot = {
  calls: number;
  talkTimeMinutes: number;
  manualSms: number;
  autoSms: number;
  manualEmail: number;
  autoEmail: number;
  byDay: {
    date: string;
    calls: number;
    manualSms: number;
    autoSms: number;
    manualEmail: number;
    autoEmail: number;
  }[];
};

export type Snapshot = {
  syncedAt: string;
  windowDays: number;
  callers: Record<string, CallerSnapshot>;
};

export function readSnapshot(): Snapshot | null {
  const p = join(process.cwd(), "data", "snapshot.json");
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed.syncedAt || !parsed.callers) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function snapshotAgeMinutes(snap: Snapshot): number {
  const ageMs = Date.now() - new Date(snap.syncedAt).getTime();
  return Math.round(ageMs / 60000);
}

export function filterByDayWindow(byDay: CallerSnapshot["byDay"], floorMs: number) {
  const f = floorMs;
  return byDay.filter((d) => new Date(d.date).getTime() >= f);
}

export function aggregateByDay(byDay: CallerSnapshot["byDay"]) {
  return byDay.reduce(
    (acc, d) => {
      acc.calls += d.calls;
      acc.manualSms += d.manualSms;
      acc.autoSms += d.autoSms;
      acc.manualEmail += d.manualEmail;
      acc.autoEmail += d.autoEmail;
      return acc;
    },
    { calls: 0, manualSms: 0, autoSms: 0, manualEmail: 0, autoEmail: 0 }
  );
}
