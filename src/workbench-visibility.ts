export const workbenchElements = [
  ["clock", "时钟与日期"], ["tasks", "今日事项"], ["module", "右侧功能内容"],
  ["navigation", "底部功能导航"], ["brand", "品牌文字"], ["footer", "页脚信息"],
] as const;
export type WorkbenchElement = typeof workbenchElements[number][0];
export type WorkbenchVisibility = Record<WorkbenchElement, boolean>;
export const defaultWorkbenchVisibility = (): WorkbenchVisibility => ({ clock: true, tasks: true, module: true, navigation: true, brand: true, footer: true });
export function applyVisibilityProperties(current: WorkbenchVisibility, properties: Record<string, { value: unknown }>): WorkbenchVisibility {
  const result = { ...current };
  for (const [key] of workbenchElements) {
    const value = properties[`show${key}`]?.value;
    if (typeof value === "boolean") result[key] = value;
  }
  return result;
}

export const workbenchCapabilities = ["enabletime", "enabletasks", "enableevent", "enablemedia", "enablefocus"] as const;

/** Host defaults and temporary page controls have separate lifetimes. */
export class WorkbenchControls {
  readonly properties: Record<string, { value: unknown }> = {};
  private defaults = defaultWorkbenchVisibility();
  private modeOverride?: boolean;
  expanded = false;

  get enabled() { return this.expanded || (this.modeOverride ?? this.properties.desktopmode?.value !== "archive"); }
  get visibility(): WorkbenchVisibility {
    return this.expanded ? { ...defaultWorkbenchVisibility(), footer: this.defaults.footer } : { ...this.defaults };
  }
  apply(properties: Record<string, { value: unknown }>) {
    Object.assign(this.properties, properties);
    this.defaults = applyVisibilityProperties(this.defaults, properties);
  }
  setMode(enabled: boolean) { this.expanded = false; this.modeOverride = enabled; }
  toggleExpanded() { this.expanded = !this.expanded; }
  laneEnabled(lane: number) {
    return lane >= 0 && lane < workbenchCapabilities.length && (this.expanded || this.properties[workbenchCapabilities[lane]]?.value !== false);
  }
  get lanes() { return workbenchCapabilities.map((_, lane) => lane).filter(lane => this.laneEnabled(lane)); }
}
