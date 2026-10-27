// Clock helpers and a sunrise/sunset calculation for "sunrise to sunset" rules.

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const fmt = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
/** 0 = Sunday … 6 = Saturday */
export const weekday = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay();

const rad = Math.PI / 180;
/** Sunrise and sunset in local minutes (standard solar equation, ±2 min). */
export function sunTimes(iso: string, lat: number, lng: number, tz: number): { rise: number; set: number } {
  const J = new Date(iso + 'T12:00:00Z').getTime() / 86400000 + 2440587.5;
  const n = Math.round(J - 2451545 + 0.0008);
  const Js = n - lng / 360;
  const M = (357.5291 + 0.98560028 * Js) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const L = (M + C + 180 + 102.9372) % 360;
  const Jt = 2451545 + Js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
  const dec = Math.asin(Math.sin(L * rad) * Math.sin(23.44 * rad));
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
  const H = Math.acos(cosH) / rad;
  const local = (j: number) => {
    const ms = (j - 2440587.5) * 86400000;
    const d = new Date(ms);
    return Math.round(d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + tz * 60) % 1440;
  };
  return { rise: local(Jt - H / 360), set: local(Jt + H / 360) };
}
