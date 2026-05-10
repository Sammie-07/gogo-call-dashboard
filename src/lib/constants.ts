export const GHL_BASE = "https://services.leadconnectorhq.com";
export const GHL_VERSION = "2021-07-28";
export const TZ = "America/Detroit";

export const PIPELINE_ID = "4ODbBsC9MIjSBtnIOETl";
export const WON_STAGE_GGTC = "4e0dc282-03f6-480e-b4f1-9e966ec0a179";
export const WON_STAGE_CIRCLE = "a2a187de-d33d-40c3-bdc5-554306761ed1";
export const WON_STAGE_IDS = [WON_STAGE_GGTC, WON_STAGE_CIRCLE];
export const WON_STAGE_NAMES: Record<string, string> = {
  [WON_STAGE_GGTC]: "Closed - GGTC",
  [WON_STAGE_CIRCLE]: "Closed - Circle",
};

export type Caller = {
  id: string;
  display: string;
  color: string;
  badgeClass: string;
};

export const CALLERS: Caller[] = [
  {
    id: "C7PplofCN88pv8MTTiZT",
    display: "Natalia",
    color: "#8b5cf6",
    badgeClass: "bg-natalia/20 text-natalia border-natalia/40",
  },
  {
    id: "Z6C8jEN8ccsSWv70qBr1",
    display: "Ferny",
    color: "#06b6d4",
    badgeClass: "bg-ferny/20 text-ferny border-ferny/40",
  },
];

export const CALLER_BY_ID = Object.fromEntries(CALLERS.map((c) => [c.id, c]));
