const TZ = "Europe/Berlin";
const usd = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
export const price = (n: number) => `${usd.format(n)} $`;
export const pct = (n: number) =>
  `${n > 0 ? "+" : ""}${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
export const day = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
export const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
export const stamp = (iso: string) => `${day(iso)}, ${time(iso)}`;
export function hue(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
export const STANCE = {
  bull: "Bulle",
  bear: "Bär",
  neutral: "Neutral",
  meme: "Meme",
} as const;
