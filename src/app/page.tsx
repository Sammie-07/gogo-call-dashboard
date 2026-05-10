import { CALLERS } from "@/lib/constants";
import {
  buildOppsCreatedSeries,
  buildRevenueSeries,
  computeActivePipeline,
  computeCreatedMetrics,
  computeWonMetrics,
  emptyMetrics,
  finalizeRatios,
} from "@/lib/metrics";
import { dateBounds, isRange, rangeBounds, toIsoDate } from "@/lib/range";
import { readSnapshot, snapshotAgeMinutes } from "@/lib/snapshot";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CallerColumn } from "@/components/CallerColumn";
import { CallsChart } from "@/components/CallsChart";
import { DatePicker } from "@/components/DatePicker";
import { RangeToggle } from "@/components/RangeToggle";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const customDay = sp.date ? dateBounds(sp.date) : null;
  const range = isRange(sp.range) ? sp.range : "today";
  const bounds = customDay ?? rangeBounds(range);
  const { start, end, label, isAllTime } = bounds;
  const startMs = start.getTime();
  const endMs = end.getTime();

  const snapshot = readSnapshot();
  const snapshotFresh = snapshot ? new Date(snapshot.syncedAt).getTime() > 0 : false;

  type SnapOppArr = NonNullable<NonNullable<typeof snapshot>["callers"][string]["opportunities"]>;
  const filteredCreated: Record<string, SnapOppArr> = {};
  const filteredUpdated: Record<string, SnapOppArr> = {};

  const metrics = CALLERS.map((c) => {
    const m = emptyMetrics(c.id, c.display, c.color);
    const snap = snapshot?.callers[c.id];

    if (snapshotFresh && snap) {
      const allOpps = snap.opportunities ?? [];
      const created = isAllTime
        ? allOpps
        : allOpps.filter((o) => {
            const t = o.createdAt ? new Date(o.createdAt).getTime() : 0;
            return t >= startMs && t <= endMs;
          });
      const updated = isAllTime
        ? allOpps
        : allOpps.filter((o) => {
            const t = o.updatedAt ? new Date(o.updatedAt).getTime() : 0;
            return t >= startMs && t <= endMs;
          });
      filteredCreated[c.id] = created;
      filteredUpdated[c.id] = updated;
      computeCreatedMetrics(created, m);
      computeWonMetrics(updated, m);
      computeActivePipeline(allOpps, m);

      const allAppts = snap.appointments ?? [];
      m.appointments = isAllTime
        ? allAppts.length
        : allAppts.filter((a) => {
            const t = a.startTime ? new Date(a.startTime).getTime() : 0;
            return t >= startMs && t <= endMs;
          }).length;

      const allConvs = snap.conversationsAll ?? [];
      m.conversations = isAllTime
        ? allConvs.length
        : allConvs.filter((cv) => cv.lastMessageDate >= startMs && cv.lastMessageDate <= endMs).length;

      const days = isAllTime ? snap.byDay : snap.byDay.filter((d) => {
        const t = new Date(d.date).getTime();
        return t >= startMs && t <= endMs;
      });
      m.outboundCalls = days.reduce((s, d) => s + d.calls, 0);
      m.manualSms = days.reduce((s, d) => s + d.manualSms, 0);
      m.autoSms = days.reduce((s, d) => s + d.autoSms, 0);
      m.manualEmail = days.reduce((s, d) => s + d.manualEmail, 0);
      m.autoEmail = days.reduce((s, d) => s + d.autoEmail, 0);
      m.manualFollowUps = m.manualSms + m.manualEmail;
      m.autoFollowUps = m.autoSms + m.autoEmail;
      m.outboundSms = m.manualSms + m.autoSms;
      m.outboundEmail = m.manualEmail + m.autoEmail;
      m.followUpsTotal = m.manualFollowUps;
      const fraction = isAllTime ? 1 : days.length / Math.max(snap.byDay.length, 1);
      m.talkTimeMinutes = Math.round(snap.talkTimeMinutes * fraction);
      m.metricsSource = "synced";
    } else {
      filteredCreated[c.id] = [];
      filteredUpdated[c.id] = [];
      m.metricsSource = "approx";
    }

    finalizeRatios(m);
    return m;
  });

  const chartStart = isAllTime ? new Date(Date.now() - 29 * 24 * 60 * 60 * 1000) : start;
  const chartEnd = end;
  const chartStartMs = chartStart.getTime();
  const chartEndMs = chartEnd.getTime();
  const chartCreated: Record<string, SnapOppArr> = {};
  const chartUpdated: Record<string, SnapOppArr> = {};
  for (const c of CALLERS) {
    const all = snapshot?.callers[c.id]?.opportunities ?? [];
    chartCreated[c.id] = all.filter((o) => {
      const t = o.createdAt ? new Date(o.createdAt).getTime() : 0;
      return t >= chartStartMs && t <= chartEndMs;
    });
    chartUpdated[c.id] = all.filter((o) => {
      const t = o.updatedAt ? new Date(o.updatedAt).getTime() : 0;
      return t >= chartStartMs && t <= chartEndMs;
    });
  }
  const oppsCreatedSeries = buildOppsCreatedSeries(chartCreated, chartStart, chartEnd);
  const revenueSeries = buildRevenueSeries(chartUpdated, chartStart, chartEnd);
  const chartLabel = isAllTime ? " · 30-day trend" : "";

  const totalRevenue = metrics.reduce((s, m) => s + m.revenue, 0);
  const totalCalls = metrics.reduce((s, m) => s + m.outboundCalls, 0);
  const totalWon = metrics.reduce((s, m) => s + m.oppsWon, 0);
  const totalCreated = metrics.reduce((s, m) => s + m.oppsCreated, 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
      <AutoRefresh />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Call Dashboard</h1>
          <p className="text-sm text-zinc-500">
            {label} · auto-refresh 30s
            {snapshotFresh && snapshot ? ` · calls synced ${snapshotAgeMinutes(snapshot)}m ago` : " · calls approximate (run npm run sync)"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeToggle active={customDay ? null : range} />
          <DatePicker initial={sp.date} todayIso={toIsoDate(new Date())} />
        </div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryStat label="Revenue" value={fmtUsd(totalRevenue)} />
        <SummaryStat label="Deals won" value={String(totalWon)} />
        <SummaryStat label="New leads" value={String(totalCreated)} />
        <SummaryStat label="Calls" value={String(totalCalls)} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {metrics.map((m) => (
          <CallerColumn key={m.callerId} m={m} />
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CallsChart data={oppsCreatedSeries} title={`New leads${chartLabel}`} />
        <CallsChart data={revenueSeries} title={`Revenue (won deals)${chartLabel}`} />
      </section>

      <footer className="text-xs text-zinc-600 pt-4 border-t border-[#262626]">
        Data from GoHighLevel · Sales Pipeline · Won = Closed-GGTC + Closed-Circle
      </footer>
    </main>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#141414] border border-[#262626] rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
