type Props = {
  label: string;
  value: string | number;
  sub?: string;
};

export function KPI({ label, value, sub }: Props) {
  return (
    <div className="bg-[#141414] border border-[#262626] rounded-lg p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
