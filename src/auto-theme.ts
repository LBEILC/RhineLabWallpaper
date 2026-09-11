// Scheduled light/dark switching, configured from Wallpaper Engine properties.
// The decision changes only when the schedule crosses a boundary, so a manual
// choice made in between stays visible until the next configured time.
export type ColorTheme = "light" | "dark";

export type AutoThemeConfig = {
  enabled: boolean;
  darkHour: number;
  darkMinute: number;
  lightHour: number;
  lightMinute: number;
};

export const defaultAutoTheme: AutoThemeConfig = {
  enabled: false,
  darkHour: 19,
  darkMinute: 0,
  lightHour: 7,
  lightMinute: 0,
};

type PropertyBag = Record<string, { value?: unknown } | undefined>;

function wholeNumber(value: unknown, max: number, fallback: number) {
  const number = typeof value === "number" ? Math.round(value) : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(0, number));
}

/** Missing or malformed host values fall back to the documented defaults. */
export function autoThemeFromProperties(properties: PropertyBag): AutoThemeConfig {
  return {
    enabled: properties.autotheme?.value === true,
    darkHour: wholeNumber(properties.darkstarthour?.value, 23, defaultAutoTheme.darkHour),
    darkMinute: wholeNumber(properties.darkstartminute?.value, 59, defaultAutoTheme.darkMinute),
    lightHour: wholeNumber(properties.lightstarthour?.value, 23, defaultAutoTheme.lightHour),
    lightMinute: wholeNumber(properties.lightstartminute?.value, 59, defaultAutoTheme.lightMinute),
  };
}

export function formatClock(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Short schedule text for the in-wallpaper settings note. */
export function autoThemeSchedule(config: AutoThemeConfig) {
  return `暗色 ${formatClock(config.darkHour, config.darkMinute)} / 亮色 ${formatClock(config.lightHour, config.lightMinute)}`;
}

/**
 * Theme for the given local time, or null when no automatic switching applies.
 * The dark window may wrap past midnight; equal times mean "keep the manual
 * choice" instead of an ambiguous zero-length window.
 */
export function autoThemeTarget(config: AutoThemeConfig, date: Date): ColorTheme | null {
  if (!config.enabled) return null;
  const darkStart = config.darkHour * 60 + config.darkMinute;
  const lightStart = config.lightHour * 60 + config.lightMinute;
  if (darkStart === lightStart) return null;
  const now = date.getHours() * 60 + date.getMinutes();
  const dark = darkStart < lightStart
    ? now >= darkStart && now < lightStart
    : now >= darkStart || now < lightStart;
  return dark ? "dark" : "light";
}
