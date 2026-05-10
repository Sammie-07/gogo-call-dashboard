import { format, eachDayOfInterval } from "date-fns";
import { CALLERS, WON_STAGE_CIRCLE, WON_STAGE_GGTC, WON_STAGE_IDS } from "./constants";

type Opportunity = {
  id: string;
  monetaryValue?: number;
  pipelineStageId: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CallerMetrics = {
  callerId: string;
  display: string;
  color: string;
  oppsCreated: number;
  oppsWon: number;
  oppsLost: number;
  revenue: number;
  revenueGGTC: number;
  revenueCircle: number;
  activePipelineValue: number;
  activePipelineCount: number;
  avgDealSize: number;
  conversionRate: number;
  avgTalkSeconds: number;
  appointments: number;
  conversations: number;
  outboundCalls: number;
  outboundSms: number;
  outboundEmail: number;
  manualSms: number;
  autoSms: number;
  manualEmail: number;
  autoEmail: number;
  manualFollowUps: number;
  autoFollowUps: number;
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
    revenueGGTC: 0,
    revenueCircle: 0,
    activePipelineValue: 0,
    activePipelineCount: 0,
    avgDealSize: 0,
    conversionRate: 0,
    avgTalkSeconds: 0,
    appointments: 0,
    conversations: 0,
    outboundCalls: 0,
    outboundSms: 0,
    outboundEmail: 0,
    manualSms: 0,
    autoSms: 0,
    manualEmail: 0,
    autoEmail: 0,
    manualFollowUps: 0,
    autoFollowUps: 0,
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
      const v = o.monetaryValue ?? 0;
      m.revenue += v;
      if (o.pipelineStageId === WON_STAGE_GGTC) m.revenueGGTC += v;
      else if (o.pipelineStageId === WON_STAGE_CIRCLE) m.revenueCircle += v;
    } else if (o.status === "lost") {
      m.oppsLost += 1;
    }
  }
}

export function computeActivePipeline(allOpps: Opportunity[], m: CallerMetrics) {
  for (const o of allOpps) {
    const isWon = WON_STAGE_IDS.includes(o.pipelineStageId);
    const isLost = o.status === "lost" || o.status === "abandoned";
    if (isWon || isLost) continue;
    m.activePipelineCount += 1;
    m.activePipelineValue += o.monetaryValue ?? 0;
  }
}

export function finalizeRatios(m: CallerMetrics) {
  m.avgDealSize = m.oppsWon > 0 ? m.revenue / m.oppsWon : 0;
  m.conversionRate = m.outboundCalls > 0 ? m.oppsWon / m.outboundCalls : 0;
  m.avgTalkSeconds = m.outboundCalls > 0 ? Math.round((m.talkTimeMinutes * 60) / m.outboundCalls) : 0;
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
