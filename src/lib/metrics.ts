import { format, eachDayOfInterval } from "date-fns";
import { CALLERS, WON_STAGE_IDS } from "./constants";
import type { CalendarEvent, Conversation, Message, Opportunity } from "./ghl";

export type CallerMetrics = {
  callerId: string;
  display: string;
  color: string;
  oppsCreated: number;
  oppsWon: number;
  oppsLost: number;
  revenue: number;
  avgDealSize: number;
  conversionRate: number;
  appointments: number;
  conversations: number;
  outboundCalls: number;
  outboundSms: number;
  outboundEmail: number;
  talkTimeMinutes: number;
  followUpsTotal: number;
  metricsSource: "synced" | "approx";
};

export function emptyMetrics(callerId: string, display: string, color: string): CallerMetrics {
  return {
    callerId,
    display,
    color,
    oppsCreated: 0,
    oppsWon: 0,
    oppsLost: 0,
    revenue: 0,
    avgDealSize: 0,
    conversionRate: 0,
    appointments: 0,
    conversations: 0,
    outboundCalls: 0,
    outboundSms: 0,
    outboundEmail: 0,
    talkTimeMinutes: 0,
    followUpsTotal: 0,
    metricsSource: "approx",
  };
}

export function computeCreatedMetrics(created: Opportunity[], m: CallerMetrics) {
  m.oppsCreated += created.length;
}

export function computeWonMetrics(updated: Opportunity[], m: CallerMetrics) {
  for (const o of updated) {
    if (WON_STAGE_IDS.includes(o.pipelineStageId)) {
      m.oppsWon += 1;
      m.revenue += o.monetaryValue ?? 0;
    } else if (o.status === "lost") {
      m.oppsLost += 1;
    }
  }
}

export function finalizeRatios(m: CallerMetrics) {
  m.avgDealSize = m.oppsWon > 0 ? m.revenue / m.oppsWon : 0;
  m.conversionRate = m.oppsCreated > 0 ? m.oppsWon / m.oppsCreated : 0;
}

export function computeConvCount(convs: Conversation[], windowStartMs: number): number {
  if (windowStartMs <= 0) return convs.length;
  return convs.filter((c) => (c.lastMessageDate ?? 0) >= windowStartMs).length;
}

export function computeConvSummary(convs: Conversation[], windowStartMs: number, m: CallerMetrics) {
  const inWindow = windowStartMs <= 0 ? convs : convs.filter((c) => (c.lastMessageDate ?? 0) >= windowStartMs);
  m.conversations += inWindow.length;
  for (const c of inWindow) {
    if (c.lastMessageDirection !== "outbound") continue;
    switch (c.lastMessageType) {
      case "TYPE_CALL":
        m.outboundCalls += 1;
        break;
      case "TYPE_SMS":
        m.outboundSms += 1;
        break;
      case "TYPE_EMAIL":
        m.outboundEmail += 1;
        break;
    }
  }
  m.followUpsTotal = m.outboundSms + m.outboundEmail;
}

export function computeMessageMetrics(messages: Message[], floor: number, m: CallerMetrics) {
  for (const msg of messages) {
    if (msg.direction !== "outbound") continue;
    if (msg.userId !== m.callerId) continue;
    const ts = new Date(msg.dateAdded ?? 0).getTime();
    if (floor > 0 && ts < floor) continue;
    const mt = msg.messageType;
    if (mt === "TYPE_CALL") {
      m.outboundCalls += 1;
      const dur = msg.meta?.call?.duration ?? 0;
      m.talkTimeMinutes += dur / 60;
    } else if (mt === "TYPE_SMS") {
      m.outboundSms += 1;
    } else if (mt === "TYPE_EMAIL") {
      m.outboundEmail += 1;
    }
  }
  m.followUpsTotal = m.outboundSms + m.outboundEmail;
}

export function computeAppointmentMetrics(events: CalendarEvent[], m: CallerMetrics) {
  m.appointments += events.length;
}

export type DailyPoint = { date: string; Natalia: number; Ferny: number };

export function buildOppsCreatedSeries(
  oppsByCaller: Record<string, Opportunity[]>,
  start: Date,
  end: Date
): DailyPoint[] {
  const days = eachDayOfInterval({ start, end });
  return days.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    const point: DailyPoint = { date: format(d, "MMM d"), Natalia: 0, Ferny: 0 };
    for (const c of CALLERS) {
      const opps = oppsByCaller[c.id] ?? [];
      const dayCount = opps.filter((o) => {
        const ds = o.createdAt ?? "";
        return ds.startsWith(key);
      }).length;
      (point as Record<string, number | string>)[c.display] = dayCount;
    }
    return point;
  });
}

export function buildRevenueSeries(
  oppsByCaller: Record<string, Opportunity[]>,
  start: Date,
  end: Date
): DailyPoint[] {
  const days = eachDayOfInterval({ start, end });
  return days.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    const point: DailyPoint = { date: format(d, "MMM d"), Natalia: 0, Ferny: 0 };
    for (const c of CALLERS) {
      const opps = oppsByCaller[c.id] ?? [];
      const dayRev = opps
        .filter((o) => WON_STAGE_IDS.includes(o.pipelineStageId))
        .filter((o) => (o.updatedAt ?? "").startsWith(key))
        .reduce((sum, o) => sum + (o.monetaryValue ?? 0), 0);
      (point as Record<string, number | string>)[c.display] = dayRev;
    }
    return point;
  });
}
