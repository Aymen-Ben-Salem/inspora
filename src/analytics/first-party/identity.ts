import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { VisitorContext } from "./types";
import { analyticsEncryptionKey } from "./context";
const ISO = new Set(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  ),
);
export function countryCode(value: string | null) {
  return value && ISO.has(value) ? value : null;
}
export async function readVisitorContext(
  request: Request,
  now: Date,
  options?: {
    trusted: boolean;
    epoch(month: string): Promise<Buffer> | Buffer;
    abuseSecret?: Buffer;
  },
): Promise<VisitorContext> {
  const trusted =
    options?.trusted ??
    (process.env.VERCEL === "1" &&
      ["preview", "production"].includes(process.env.VERCEL_ENV ?? ""));
  const ua = request.headers.get("user-agent")?.slice(0, 512) ?? "";
  const ip = trusted
    ? request.headers.get("x-vercel-forwarded-for")?.trim()
    : null;
  const month = now.toISOString().slice(0, 7);
  let abuseKey: string | undefined;
  if (ip && isIP(ip)) {
    try {
      const secret = options ? options.abuseSecret : analyticsEncryptionKey();
      const arrival = options ? now : new Date();
      if (secret)
        abuseKey = createHmac("sha256", secret)
          .update(
            JSON.stringify([
              "minute-abuse",
              Math.floor(arrival.getTime() / 60000),
              ip,
            ]),
          )
          .digest("hex");
    } catch {}
  }
  let visitorKey: string | null = null;
  if (ip && isIP(ip) && ua) {
    let key: Buffer | null;
    try {
      key = options
        ? await options.epoch(month)
        : await (await import("./epochs")).readIdentityEpoch(month, new Date());
    } catch {
      key = null;
    }
    if (key)
      visitorKey = `${month}:${createHmac("sha256", key)
        .update(JSON.stringify(["inspora", ip, ua]))
        .digest("hex")}`;
  }
  let referrerDomain: string | null = null;
  try {
    const url = new URL(request.headers.get("referer") ?? "");
    if (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== new URL(request.url).hostname
    )
      referrerDomain = url.hostname.toLowerCase().slice(0, 253);
  } catch {}
  return {
    visitorKey,
    ...(abuseKey ? { abuseKey } : {}),
    countryCode: trusted
      ? countryCode(request.headers.get("x-vercel-ip-country"))
      : null,
    device: !ua
      ? "unknown"
      : /ipad|tablet/i.test(ua)
        ? "tablet"
        : /mobile|iphone|android/i.test(ua)
          ? "mobile"
          : "desktop",
    referrerDomain,
  };
}
