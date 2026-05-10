import { GHL_BASE, GHL_VERSION, PIPELINE_ID } from "./constants";

const REVALIDATE = 300;

function headers() {
  return {
    Authorization: `Bearer ${process.env.GHL_PIT!}`,
    Version: GHL_VERSION,
    Accept: "application/json",
  };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(private capacity: number, private refillPerSec: number) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  async acquire() {
    while (true) {
      const now = Date.now();
      const elapsed = (now - this.lastRefill) / 1000;
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
      this.lastRefill = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const need = 1 - this.tokens;
      const ms = Math.ceil((need / this.refillPerSec) * 1000) + 10;
      await sleep(ms);
    }
  }
}

const bucketGlobalKey = "__ghl_bucket__";
const g = globalThis as Record<string, unknown>;
if (!g[bucketGlobalKey]) g[bucketGlobalKey] = new TokenBucket(4, 3);
const bucket = g[bucketGlobalKey] as TokenBucket;

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const url = `${GHL_BASE}${path}${qs.toString() ? `?${qs}` : ""}`;
  let attempt = 0;
  while (true) {
    await bucket.acquire();
    const res = await fetch(url, { headers: headers(), next: { revalidate: REVALIDATE } });
    if (res.ok) return res.json() as Promise<T>;
    if (res.status === 429 && attempt < 2) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      const wait = retryAfter > 0 ? retryAfter * 1000 : 800 * Math.pow(2, attempt);
      await sleep(Math.min(wait, 4_000));
      attempt++;
      continue;
    }
    const body = await res.text();
    throw new Error(`GHL ${res.status} ${path}: ${body.slice(0, 300)}`);
  }
}

export type Opportunity = {
  id: string;
  name?: string;
  monetaryValue?: number;
  pipelineStageId: string;
  status: string;
  assignedTo?: string;
  contactId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SearchOppsResp = {
  opportunities: Opportunity[];
  meta: { total: number; nextPageUrl?: string | null; startAfter?: string; startAfterId?: string };
};

export async function fetchOpportunities(opts: {
  locationId: string;
  assignedTo?: string;
}): Promise<Opportunity[]> {
  const all: Opportunity[] = [];
  let page = 1;
  while (true) {
    const resp = await get<SearchOppsResp>("/opportunities/search", {
      location_id: opts.locationId,
      pipeline_id: PIPELINE_ID,
      assigned_to: opts.assignedTo,
      limit: 100,
      page,
    });
    all.push(...resp.opportunities);
    if (resp.opportunities.length < 100 || page >= 20) break;
    page++;
  }
  return all;
}

export function filterByDate(
  opps: Opportunity[],
  field: "createdAt" | "updatedAt",
  start: Date,
  end: Date
): Opportunity[] {
  const s = start.getTime();
  const e = end.getTime();
  return opps.filter((o) => {
    const v = o[field];
    if (!v) return false;
    const t = new Date(v).getTime();
    return t >= s && t <= e;
  });
}

export type Conversation = {
  id: string;
  contactId: string;
  type?: string;
  lastMessageType?: string;
  lastMessageDirection?: string;
  lastMessageDate?: number;
  dateAdded?: number;
  dateUpdated?: number;
  fullName?: string;
  assignedTo?: string;
};

export type SearchConvResp = {
  conversations: Conversation[];
  total?: number;
};

export async function fetchConversations(opts: {
  locationId: string;
  assignedTo?: string;
  floor?: number;
  cap?: number;
}): Promise<Conversation[]> {
  const all: Conversation[] = [];
  const cap = opts.cap ?? 5000;
  let cursor: number | undefined = undefined;

  for (let page = 0; page < 100 && all.length < cap; page++) {
    const params: Record<string, string | number | undefined> = {
      locationId: opts.locationId,
      assignedTo: opts.assignedTo,
      sort: "desc",
      sortBy: "last_message_date",
      limit: 100,
    };
    if (cursor !== undefined) params.startAfterDate = cursor;

    const resp = await get<SearchConvResp>("/conversations/search", params);
    if (!resp.conversations?.length) break;

    let hitFloor = false;
    for (const conv of resp.conversations) {
      const d = conv.lastMessageDate ?? 0;
      if (opts.floor !== undefined && d < opts.floor) {
        hitFloor = true;
        break;
      }
      all.push(conv);
    }
    if (hitFloor) break;
    if (resp.conversations.length < 100) break;

    const last = resp.conversations[resp.conversations.length - 1];
    if (!last.lastMessageDate || last.lastMessageDate === cursor) break;
    cursor = last.lastMessageDate;
  }
  return all;
}

export type Message = {
  id: string;
  type: string;
  messageType: string;
  direction: "inbound" | "outbound";
  dateAdded: string;
  userId?: string;
  body?: string;
  meta?: { call?: { duration?: number; status?: string } };
};

export type MessagesResp = {
  messages: { messages: Message[]; nextPage?: boolean; lastMessageId?: string };
};

export async function fetchMessages(conversationId: string, limit = 100): Promise<Message[]> {
  const resp = await get<MessagesResp>(`/conversations/${conversationId}/messages`, { limit });
  return resp.messages?.messages ?? [];
}

type MsgCacheEntry = { ts: number; data: Message[] };
const MSG_CACHE_TTL = 10 * 60 * 1000;
const msgCacheKey = "__ghl_msg_cache__";
if (!g[msgCacheKey]) g[msgCacheKey] = new Map<string, MsgCacheEntry>();
const msgCache = g[msgCacheKey] as Map<string, MsgCacheEntry>;

export async function fetchAllConversationMessages(
  convs: Conversation[],
  opts: { concurrency?: number; cap?: number; cacheKey?: string } = {}
): Promise<Message[]> {
  const concurrency = opts.concurrency ?? 3;
  const cap = opts.cap ?? 30;

  if (opts.cacheKey) {
    const hit = msgCache.get(opts.cacheKey);
    if (hit && Date.now() - hit.ts < MSG_CACHE_TTL) return hit.data;
  }

  const phoneOnly = convs.filter((c) => c.type === "TYPE_PHONE");
  const sorted = phoneOnly.sort((a, b) => (b.lastMessageDate ?? 0) - (a.lastMessageDate ?? 0));
  const targets = sorted.slice(0, cap);
  const all: Message[] = [];
  const queue = [...targets];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const conv = queue.shift();
      if (!conv) break;
      try {
        const msgs = await fetchMessages(conv.id, 100);
        all.push(...msgs);
      } catch {
        // Skip on failure (rate limit etc) — better to undercount than fail
      }
    }
  });
  await Promise.all(workers);

  if (opts.cacheKey) msgCache.set(opts.cacheKey, { ts: Date.now(), data: all });
  return all;
}

export type CalendarEvent = {
  id: string;
  calendarId: string;
  contactId?: string;
  title?: string;
  startTime: string;
  endTime: string;
  appointmentStatus?: string;
  assignedUserId?: string;
  createdBy?: { userId?: string };
  dateAdded?: string;
};

export type CalendarEventsResp = { events: CalendarEvent[] };

export async function fetchCalendarEvents(opts: {
  locationId: string;
  startTime: string;
  endTime: string;
  userId?: string;
}): Promise<CalendarEvent[]> {
  const resp = await get<CalendarEventsResp>("/calendars/events", {
    locationId: opts.locationId,
    startTime: new Date(opts.startTime).getTime(),
    endTime: new Date(opts.endTime).getTime(),
    userId: opts.userId,
  });
  return resp.events ?? [];
}
