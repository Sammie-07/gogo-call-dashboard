import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

config({ path: ".env.local" });

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const PIPELINE_ID = "4ODbBsC9MIjSBtnIOETl";
const CALLERS = [
  { id: "C7PplofCN88pv8MTTiZT", display: "Natalia" },
  { id: "Z6C8jEN8ccsSWv70qBr1", display: "Ferny" },
];

const PIT = process.env.GHL_PIT!;
const LOC = process.env.GHL_LOCATION_ID!;
const WINDOW_DAYS = Number(process.env.SYNC_WINDOW_DAYS ?? 90);

if (!PIT || !LOC) {
  console.error("Missing GHL_PIT or GHL_LOCATION_ID in .env.local");
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

class Bucket {
  private tokens: number;
  private last: number;
  constructor(private cap: number, private rate: number) {
    this.tokens = cap;
    this.last = Date.now();
  }
  async take() {
    while (true) {
      const now = Date.now();
      this.tokens = Math.min(this.cap, this.tokens + ((now - this.last) / 1000) * this.rate);
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await sleep(Math.ceil(((1 - this.tokens) / this.rate) * 1000) + 20);
    }
  }
}

const bucket = new Bucket(4, 3);

async function ghGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const url = `${GHL_BASE}${path}${qs.toString() ? `?${qs}` : ""}`;
  let attempt = 0;
  while (true) {
    await bucket.take();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${PIT}`, Version: GHL_VERSION, Accept: "application/json" },
    });
    if (res.ok) return res.json() as Promise<T>;
    if (res.status === 429 && attempt < 8) {
      const ra = Number(res.headers.get("retry-after")) || 0;
      const wait = ra > 0 ? ra * 1000 : Math.min(60_000, 2000 * Math.pow(2, attempt));
      await sleep(wait);
      attempt++;
      continue;
    }
    const body = await res.text();
    throw new Error(`GHL ${res.status} ${path}: ${body.slice(0, 300)}`);
  }
}

type Conv = { id: string; type?: string; lastMessageDate?: number; assignedTo?: string };
type Msg = {
  id: string;
  messageType?: string;
  direction?: string;
  userId?: string;
  source?: string;
  dateAdded?: string;
  meta?: { call?: { duration?: number } };
};

async function fetchConvs(callerId: string, floorMs: number): Promise<Conv[]> {
  const all: Conv[] = [];
  let lastDate: number | undefined;
  for (let i = 0; i < 50; i++) {
    type Resp = { conversations: Conv[] };
    const resp = await ghGet<Resp>("/conversations/search", {
      locationId: LOC,
      assignedTo: callerId,
      sort: "desc",
      sortBy: "last_message_date",
      limit: 100,
      lastMessageBefore: lastDate,
    });
    const batch = resp.conversations ?? [];
    if (batch.length === 0) break;
    const inWindow = batch.filter((c) => (c.lastMessageDate ?? 0) >= floorMs);
    all.push(...inWindow);
    if (inWindow.length < batch.length) break;
    const oldest = batch[batch.length - 1].lastMessageDate;
    if (!oldest || oldest === lastDate) break;
    lastDate = oldest;
  }
  return all;
}

async function fetchMsgs(convId: string): Promise<Msg[]> {
  type Resp = { messages: { messages: Msg[] } };
  const resp = await ghGet<Resp>(`/conversations/${convId}/messages`, { limit: 100 });
  return resp.messages?.messages ?? [];
}

function dayKey(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

async function main() {
  const floor = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  console.log(`Syncing last ${WINDOW_DAYS} days (since ${new Date(floor).toISOString().slice(0, 10)})`);

  type CallerOut = ReturnType<typeof emptyCaller> & {
    byDay: { date: string; calls: number; manualSms: number; autoSms: number; manualEmail: number; autoEmail: number }[];
  };
  const result: Record<string, CallerOut> = {};

  for (const c of CALLERS) {
    console.log(`\n=== ${c.display} (${c.id}) ===`);
    const convs = await fetchConvs(c.id, floor);
    console.log(`  ${convs.length} conversations in window`);
    const phone = convs.filter((x) => x.type === "TYPE_PHONE");
    console.log(`  ${phone.length} TYPE_PHONE`);

    const stats = emptyCaller();
    type DayStats = { calls: number; manualSms: number; autoSms: number; manualEmail: number; autoEmail: number };
    const byDay: Record<string, DayStats> = {};

    let done = 0;
    for (const conv of phone) {
      try {
        const msgs = await fetchMsgs(conv.id);
        for (const m of msgs) {
          if (m.direction !== "outbound") continue;
          if (m.userId !== c.id) continue;
          const day = dayKey(m.dateAdded);
          const ds = (byDay[day] ??= { calls: 0, manualSms: 0, autoSms: 0, manualEmail: 0, autoEmail: 0 });
          const isManual = m.source === "app";
          if (m.messageType === "TYPE_CALL") {
            stats.calls++;
            ds.calls++;
            stats.talkTimeMinutes += (m.meta?.call?.duration ?? 0) / 60;
          } else if (m.messageType === "TYPE_SMS") {
            if (isManual) {
              stats.manualSms++;
              ds.manualSms++;
            } else {
              stats.autoSms++;
              ds.autoSms++;
            }
          } else if (m.messageType === "TYPE_EMAIL") {
            if (isManual) {
              stats.manualEmail++;
              ds.manualEmail++;
            } else {
              stats.autoEmail++;
              ds.autoEmail++;
            }
          }
        }
      } catch (e) {
        console.warn(`  skip ${conv.id}: ${(e as Error).message.slice(0, 80)}`);
      }
      done++;
      if (done % 25 === 0) console.log(`  ${done}/${phone.length} convs processed`);
    }

    stats.talkTimeMinutes = Math.round(stats.talkTimeMinutes);
    const byDayArr = Object.entries(byDay)
      .filter(([d]) => d)
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    result[c.id] = { ...stats, byDay: byDayArr };
    console.log(
      `  -> calls=${stats.calls}, manualSMS=${stats.manualSms} (auto ${stats.autoSms}), manualEmail=${stats.manualEmail} (auto ${stats.autoEmail}), talk=${stats.talkTimeMinutes}min`
    );
  }

  const snapshot = {
    syncedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    callers: result,
  };

  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  const out = join(process.cwd(), "data", "snapshot.json");
  writeFileSync(out, JSON.stringify(snapshot, null, 2));
  console.log(`\nWrote ${out}`);
}

function emptyCaller() {
  return {
    calls: 0,
    talkTimeMinutes: 0,
    manualSms: 0,
    autoSms: 0,
    manualEmail: 0,
    autoEmail: 0,
  };
}

main().catch((e) => {
  console.error("Sync failed:", e);
  process.exit(1);
});
