import type { WallpaperProperties } from "./wallpaper";

export const workbenchRegions = ["overview", "module", "navigation"] as const;
export function workbenchOffset(props: WallpaperProperties, region: string, axis: string) {
  const value = props[`wb${region}${axis}`]?.value;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(-300, Math.min(300, value)) : 0;
}

/** Keep user offsets in display pixels; never move the 3D camera or its canvas. */
export class WorkbenchPosition {
  private dirty = true;
  private observer: ResizeObserver;
  private nodes: { region: typeof workbenchRegions[number]; node: HTMLElement }[];
  constructor(private stage: HTMLElement) {
    this.nodes = workbenchRegions.flatMap(region => {
      const node = stage.querySelector<HTMLElement>(region === "navigation" ? ".wb-nav" : `.wb-${region}`);
      return node ? [{ region, node }] : [];
    });
    this.observer = new ResizeObserver(() => this.invalidate());
    this.observer.observe(stage);
    this.nodes.forEach(({node}) => this.observer.observe(node));
    stage.querySelectorAll(".wb-nav button").forEach(node => this.observer.observe(node));
    window.addEventListener("resize", () => this.invalidate());
    window.addEventListener("rhine-workbench-layout", () => this.invalidate());
  }
  invalidate() { this.dirty = true; }
  update(props: WallpaperProperties): boolean {
    if (!this.dirty) return false;
    this.dirty = false;
    const scale = this.stage.getBoundingClientRect().width / this.stage.offsetWidth || 1;
    const position = (element: HTMLElement) => {
      let x = 0, y = 0;
      for (let node: HTMLElement | null = element; node && node !== this.stage; node = node.offsetParent as HTMLElement | null) {
        x += node.offsetLeft; y += node.offsetTop;
      }
      return { x, y };
    };
    for (const { region, node } of this.nodes) {
      if (!node.offsetWidth || node.closest("[hidden]")) continue;
      const visible = region === "navigation" ? [...node.querySelectorAll<HTMLElement>("button:not([hidden])")] : [node];
      if (!visible.length) continue;
      const bounds = visible.map(element => ({ ...position(element), width: element.offsetWidth, height: element.offsetHeight }));
      const left = Math.min(...bounds.map(b => b.x)), right = Math.max(...bounds.map(b => b.x + b.width));
      const top = Math.min(...bounds.map(b => b.y)), bottom = Math.max(...bounds.map(b => b.y + b.height));
      const padding = 12 / scale;
      // Navigation shares the independently configured footer-row translation.
      const bottomInset = region === "navigation" && typeof props.uimarginbottom?.value === "number"
        ? Math.max(-300, Math.min(300, props.uimarginbottom.value)) / scale : 0;
      const constrain = (desired: number, low: number, high: number) => low <= high ? Math.max(Math.min(0, low), Math.min(Math.max(0, high), desired)) : 0;
      const x = constrain(workbenchOffset(props, region, "x") / scale, padding - left, this.stage.offsetWidth - padding - right);
      // Narrow screens retain their normal scroll flow; vertical offsets are
      // bounded by the viewport, without changing scroll-container geometry.
      const y = constrain(workbenchOffset(props, region, "y") / scale, padding - top + bottomInset, this.stage.offsetHeight - padding - bottom + bottomInset);
      for (const [axis, value] of [["x", x], ["y", y]] as const) {
        const key = `--wb-${region}-${axis}`, next = `${value}px`;
        if (this.stage.style.getPropertyValue(key) !== next) {
          if (value !== 0 || this.stage.style.getPropertyValue(key)) node.getAnimations().forEach(animation => animation.cancel());
          this.stage.style.setProperty(key, next);
        }
      }
    }
    return true;
  }
}
