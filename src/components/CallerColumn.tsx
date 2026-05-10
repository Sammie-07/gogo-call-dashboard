import { KPI } from "./KPI";
import type { CallerMetrics } from "@/lib/metrics";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const num = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

export function CallerColumn({ m }: { m: CallerMetrics }) {
  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between border-b border-[#262626] pb-3">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full" style={{ background: m.color }} />
          <h2 className="text-lg font-semibold">{m.display}</h2>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold">{usd(m.revenue)}</div>
          <div className="text-xs text-zinc-500">revenue · {m.oppsWon} won</div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <KPI
          label="Calls"
          value={num(m.outboundCalls)}
          sub={
            m.metricsSource === "synced"
              ? m.talkTimeMinutes > 0
                ? `${num(m.talkTimeMinutes)} min talk`
                : undefined
              : "approx · last-msg only"
          }
        />
        <KPI
          label="Manual follow-ups"
          value={num(m.metricsSource === "synced" ? m.manualFollowUps : m.followUpsTotal)}
          sub={
            m.metricsSource === "synced"
              ? `${num(m.manualSms)} SMS · ${num(m.manualEmail)} email · +${num(m.autoFollowUps)} auto`
              : `approx · ${num(m.outboundSms)} SMS · ${num(m.outboundEmail)} email`
          }
        />
        <KPI label="Appointments" value={num(m.appointments)} />
        <KPI label="Conversations" value={num(m.conversations)} />
        <KPI label="New leads" value={num(m.oppsCreated)} />
        <KPI label="Deals won" value={num(m.oppsWon)} sub={m.oppsLost > 0 ? `${m.oppsLost} lost` : undefined} />
        <KPI label="Avg deal" value={m.avgDealSize > 0 ? usd(m.avgDealSize) : "—"} />
        <KPI label="Conversion" value={pct(m.conversionRate)} sub="deals won per call" />
      </div>
    </section>
  );
}
