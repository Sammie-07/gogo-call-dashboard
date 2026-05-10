"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DatePicker({ initial, todayIso }: { initial?: string; todayIso: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");

  function pick(v: string) {
    setValue(v);
    if (v) router.push(`/?date=${v}`);
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-[#262626] bg-[#141414] px-2 py-1 text-sm">
      <span className="text-zinc-500 px-1">Pick day:</span>
      <input
        type="date"
        value={value}
        max={todayIso}
        onChange={(e) => pick(e.target.value)}
        className="bg-transparent text-white outline-none cursor-pointer [color-scheme:dark]"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            router.push("/?range=today");
          }}
          className="text-zinc-500 hover:text-white px-1"
          title="Clear"
        >
          ×
        </button>
      )}
    </div>
  );
}
