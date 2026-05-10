import Link from "next/link";
import type { Range } from "@/lib/range";

const OPTS: { v: Range; label: string }[] = [
  { v: "today", label: "Today" },
  { v: "7d", label: "7 days" },
  { v: "30d", label: "30 days" },
  { v: "alltime", label: "All time" },
];

export function RangeToggle({ active }: { active: Range | null }) {
  return (
    <div className="inline-flex rounded-md border border-[#262626] bg-[#141414] p-1">
      {OPTS.map((o) => (
        <Link
          key={o.v}
          href={`/?range=${o.v}`}
          className={`px-3 py-1 text-sm rounded ${active === o.v ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
