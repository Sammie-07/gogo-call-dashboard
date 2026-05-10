import { CALLERS } from "@/lib/constants";
import { fetchCalendarEvents, fetchConversations, fetchOpportunities, filterByDate } from "@/lib/ghl";
import {
  buildOppsCreatedSeries,
  buildRevenueSeries,
  computeAppointmentMetrics,
  computeConvSummary,
  computeCreatedMetrics,
  computeWonMetrics,
  emptyMetrics,
  finalizeRatios,
} from "@/lib/metrics";
import { isRange, rangeBounds, toIso } from "@/lib/range";
import { readSnapshot, snapshotAgeMinutes } from "@/lib/snapshot";
import { startOfDay, subDays } from "date-fns";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CallerColumn } from "@/components/CallerColumn";
import { CallsChart } from "@/components/CallsChart";
import { RangeToggle } from "@/components/RangeToggle";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const sp = await searchParams;
  const range = isRange(sp.range) ? sp.range : "today";
  const { start, end, label, isAllTime } = rangeBounds(range);
  const locationId = process.env.GHL_LOCATION_ID!;

  const allOppsByCaller: Record<string, Awaited<ReturnType<typeof fetchOpportunities>>> = {};
  const convsByCaller: Record<string, Awaited<ReturnType<typeof fetchConversations>>> = {};
  const apptsByCaller: Record<string, Awaited<ReturnType<typeof fetchCalendarEvents>>> = {};

  const convFloor = isAllTime ? new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).getTime() : start.getTime();

  await Promise.all(
    CALLERS.flatMap((c) => [
      fetchOpportunities({ locationId, assignedTo: c.id })
        .then((d) => {
          allOppsByCaller[c.id] = d;
        })
        .catch((e) => {
          console.error(`opps ${c.display}`, e.message);
          allOppsByCaller[c.id] = [];
        }),
      fetchConversations({ locationId, assignedTo: c.id, floor: convFloor })
        .then((d) => {
          convsByCaller[c.id] = d;
        })
        .catch((e) => {
          console.error(`convs ${c.display}`, e.message);
          convsByCaller[c.id] = [];
        }),
      fetchCalendarEvents({ locationId, startTime: toIso(start), endTime: toIso(end), userId: c.id })
        .then((d) => {
          apptsByCaller[c.id] = d;
        })
        .catch((e) => {
          console.error(`appts ${c.display}`, e.message);
          apptsByCaller[c.id] = [];
        }),
    ])
  );

  const createdByCaller: Record<string, Awaited<ReturnType<typeof fetchOpportunities>>> = {};
  const updatedByCaller: Record<string, Awaited<ReturnType<typeof fetchOpportunities>>> = {};
  for (const c of CALLERS) {
    if (isAllTime) {
      createdByCaller[c.id] = allOppsByCaller[c.id] ?? [];
      updatedByCaller[c.id] = allOppsByCaller[c.id] ?? [];
    } else {
      createdByCaller[c.id] = filterByDate(allOppsByCaller[c.id] ?? [], "createdAt", start, end);
      updatedByCaller[c.id] = filterByDate(allOppsByCaller[c.id] ?? [], "updatedAt", start, end);
    }
  }

  const snapshot = readSnapshot();
  const snapshotFresh = snapshot ? new Date(snapshot.syncedAt).getTime() > 0 : false;

  const metrics = CALLERS.map((c) => {
    const m = emptyMetrics(c.id, c.display, c.color);
    computeCreatedMetrics(createdByCaller[c.id] ?? [], m);
    computeWonMetrics(updatedByCaller[c.id] ?? [], m);
    computeConvSummary(convsByCaller[c.id] ?? [], isAllTime ? 0 : start.getTime(), m);
    computeAppointmentMetrics(apptsByCaller[c.id] ?? [], m);

    if (snapshotFresh && snapshot && snapshot.callers[c.id]) {
      const snap = snapshot.callers[c.id];
      const floor = isAllTime ? 0 : start.getTime();
      const days = floor === 0 ? snap.byDay : snap.byDay.filter((d) => new Date(d.date).getTime() >= floor);
      m.outboundCalls = days.reduce((s, d) => s + d.calls, 0);
      m.outboundSms = days.reduce((s, d) => s + d.sms, 0);
      m.outboundEmail = days.reduce((s, d) => s + d.email, 0);
      m.followUpsTotal = m.outboundSms + m.outboundEmail;
      const totalSecondsFraction = isAllTime ? 1 : days.length / Math.max(snap.byDay.length, 1);
      m.talkTimeMinutes = Math.round(snap.talkTimeMinutes * totalSecondsFraction);
      m.metricsSource = "synced";
    } else {
      m.metricsSource = "approx";
    }

    finalizeRatios(m);
    return m;
  });

  const chartStart = isAllTime ? startOfDay(subDays(new Date(), 29)) : start;
  const chartEnd = end;
  const chartCreatedByCaller: typeof createdByCaller = {};
  const chartUpdatedByCaller: typeof updatedByCaller = {};
  for (const c of CALLERS) {
    chartCreatedByCaller[c.id] = filterByDate(allOppsByCaller[c.id] ?? [], "createdAt", chartStart, chartEnd);
    chartUpdatedByCaller[c.id] = filterByDate(allOppsByCaller[c.id] ?? [], "updatedAt", chartStart, chartEnd);
  }
  const oppsCreatedSeries = buildOppsCreatedSeries(chartCreatedByCaller, chartStart, chartEnd);
  const revenueSeries = buildRevenueSeries(chartUpdatedByCaller, chartStart, chartEnd);
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
        <RangeToggle active={range} />
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryStat label="Revenue" value={fmtUsd(totalRevenue)} />
        <SummaryStat label="Deals won" value={String(totalWon)} />
        <SummaryStat label="Opps created" value={String(totalCreated)} />
        <SummaryStat label="Calls" value={String(totalCalls)} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {metrics.map((m) => (
          <CallerColumn key={m.callerId} m={m} />
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CallsChart data={oppsCreatedSeries} title={`Opportunities created${chartLabel}`} />
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
