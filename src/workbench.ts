import { tr, language, localeEvent, bindStaticTranslations } from "./i18n";
import { rollText, patchRollingPanel } from "./workbench-rolling";
import { workbenchLettering } from "./workbench-lettering";
import { escapeHtml } from "./html";
import { wallpaperHost, type WallpaperProperties } from "./wallpaper";
import { dayKey, durationText, idleTimer, parseTarget, restoreTimer, timerLeft, shouldRemindTimer } from "./workbench-state";
import "./workbench.css";
import { WorkbenchControls, type WorkbenchElement } from "./workbench-visibility";

type Media = { status?: { enabled?: boolean }; properties?: { title?: string; artist?: string; albumTitle?: string }; thumbnail?: { thumbnail?: string }; timeline?: { position?: number; duration?: number }; playing?: boolean };
declare global { interface Window { rhineWallpaperMedia?: Media; } }
const names = ["时间日期", "今日事项", "重要日程", "正在播放", "专注计时"];
const key = "rhine-workbench-v1";
export class Workbench {
  private controls = new WorkbenchControls();
  get enabled() { return this.controls.enabled; }
  private root: HTMLElement;
  private props = this.controls.properties;
  private lane = 0;
  private timer = idleTimer();
  private done: string[] = [];
  private date = dayKey(new Date());
  private storageOK = true;
  private lastSecond = -1;
  private renderedDate = "";
  private exitAnimation?: Animation;
  private lastTimerTick?: number;
  constructor(private stage: HTMLElement, private onMode: () => void, private onLane: (lane: number) => void,
    private onSound: (sound: "ui-tick" | "focus-done") => void = () => {}) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      this.timer = restoreTimer(saved?.timer);
      if (saved?.date === this.date && Array.isArray(saved.done)) this.done = saved.done.filter((s: unknown) => typeof s === "string").slice(0, 3);
    } catch { this.storageOK = false; }
    stage.insertAdjacentHTML("beforeend", `<section class="workbench" hidden aria-label="桌面工作台">
      <div class="wb-overview"><div class="wb-time"><div class="wb-kicker">${workbenchLettering('daily')}</div><time class="wb-clock"></time><time class="wb-date"><span class="wb-date-numbers" aria-hidden="true"><span class="wb-date-year"></span><span class="wb-date-dot">.</span><span class="wb-date-monthday"></span></span><span class="wb-date-weekday" aria-hidden="true"></span></time></div>
      <section class="wb-today"><div class="wb-heading"><h2>今日事项</h2><span class="wb-task-count"></span></div><div class="wb-tasks"></div></section></div>
      <section class="wb-module"><div class="wb-kicker">${workbenchLettering('workspace')} <span class="wb-index">01 / 05</span></div><h2 class="wb-title"></h2><div class="wb-content"></div><p class="wb-storage" role="status"></p></section>
      <nav class="wb-nav" aria-label="工作台功能">${names.map((n, i) => `<button data-wb-lane="${i}" aria-pressed="false"><small>0${i + 1}</small>${n}<span>↗</span></button>`).join("")}</nav>
    </section>`);
    this.root = stage.querySelector(".workbench")!;
    bindStaticTranslations(this.root);
    window.addEventListener(localeEvent, () => {
      const task = (document.activeElement as HTMLElement)?.dataset.wbTask;
      this.lastSecond = -1;
      this.renderTasks(); this.renderPanel(); this.syncFooter(); this.tick();
      if (task !== undefined) this.root.querySelector<HTMLElement>(`[data-wb-task="${task}"]`)?.focus({ preventScroll: true });
    });
    this.root.addEventListener("click", event => {
      const button = (event.target as Element).closest<HTMLButtonElement>("button");
      if (!button || button.disabled || button.hidden || this.root.inert || !this.enabled) return;
      if (button.dataset.wbLane !== undefined) {
        const lane = +button.dataset.wbLane;
        if (lane === this.lane || !this.laneEnabled(lane)) return;
        this.select(lane); onLane(this.lane); // Selecting the archive already supplies its glass sound.
      }
      if (button.dataset.wbTask !== undefined) {
        this.rollDay();
        const id = this.taskId(+button.dataset.wbTask);
        this.done = this.done.includes(id) ? this.done.filter(d => d !== id) : [...this.done, id];
        this.save(); this.renderTasks();
        this.root.querySelector<HTMLButtonElement>(`[data-wb-task="${button.dataset.wbTask}"]`)?.focus({ preventScroll: true });
        this.onSound("ui-tick");
      }
      if (button.dataset.wbTimer) { this.actTimer(button.dataset.wbTimer); this.onSound("ui-tick"); }
    });
    window.addEventListener("rhine-wallpaper-properties", event => this.apply((event as CustomEvent<WallpaperProperties>).detail));
    window.addEventListener("rhine-wallpaper-media", () => { if (this.lane === 3) this.renderPanel(); });
    window.addEventListener("resize", () => { if (this.lane === 3) this.renderPanel(); });
    const suspendReminder = () => { this.lastTimerTick = undefined; this.settle(Date.now()); };
    window.addEventListener("rhine-wallpaper-pause", suspendReminder);
    document.addEventListener("visibilitychange", suspendReminder);
    this.apply(wallpaperHost()?.properties ?? {});
    this.settle(Date.now()); // An expired timer restored from storage is never a new reminder.
  }
  private text(key: string) { const v = this.props[key]?.value; return typeof v === "string" ? v.trim().slice(0, 240) : ""; }
  private minutes(phase = this.timer.phase) { const n = this.props[phase === "focus" ? "focusminutes" : "breakminutes"]?.value; return typeof n === "number" && Number.isFinite(n) ? Math.max(1, Math.min(phase === "focus" ? 120 : 60, n)) : phase === "focus" ? 25 : 5; }
  private taskId(i: number) { return `${i}:${this.text(`task${i + 1}`)}`; }
  private apply(props: WallpaperProperties) {
    const wasEnabled = this.enabled;
    this.controls.apply(props);
    // Early/partial host updates must not clear saved tasks before their text arrives.
    const previous = this.done.length;
    this.done = this.done.filter(id => [0, 1, 2].every(i => !props[`task${i + 1}`] || !id.startsWith(`${i}:`) || id === this.taskId(i)));
    if (previous !== this.done.length) this.save();
    if (!this.laneEnabled(this.lane)) {
      this.lane = this.controls.lanes[0] ?? -1;
      if (this.lane >= 0) this.onLane(this.lane);
    }
    this.renderTasks(); this.renderPanel();
    this.syncControls(wasEnabled !== this.enabled);
  }
  setEnabled(value: boolean) {
    this.controls.setMode(value);
    this.refreshControls();
  }
  toggleExpanded() {
    this.controls.toggleExpanded();
    this.refreshControls();
  }
  private refreshControls() {
    if (!this.laneEnabled(this.lane)) this.lane = this.controls.lanes[0] ?? -1;
    this.renderPanel();
    this.syncControls(true);
  }
  private syncControls(notifyMode: boolean) {
    this.stage.dataset.workbench = String(this.enabled);
    this.stage.dataset.workbenchExpanded = String(this.controls.expanded);
    if (notifyMode) this.onMode();
    this.syncVisibility();
    this.syncElements();
    this.syncFooter();
    window.dispatchEvent(new Event("rhine-workbench-layout"));
  }
  private syncFooter() {
    const mode = this.stage.querySelector<HTMLButtonElement>('[data-action="toggle-workbench-mode"]');
    const expanded = this.stage.querySelector<HTMLButtonElement>('[data-action="toggle-workbench-expanded"]');
    if (mode) {
      mode.hidden = this.props.showmodebutton?.value === false;
      mode.textContent = this.enabled ? tr("档案展示 ↗") : tr("桌面工作台 ↗");
      mode.title = this.enabled ? tr("切换到档案展示") : tr("切换到桌面工作台");
    }
    if (expanded) {
      expanded.hidden = this.props.showworkbenchbutton?.value === false;
      expanded.textContent = this.controls.expanded ? tr("恢复自定义显示 ↙") : tr("打开完整工作台 ↗");
      expanded.setAttribute("aria-pressed", String(this.controls.expanded));
    }
    this.stage.dataset.footerInfo = String(this.controls.visibility.footer);
    this.stage.dataset.footerClock = String(this.props.showfooterclock?.value !== false);
    this.stage.dataset.footerShortcuts = String(this.props.showmodebutton?.value !== false || this.props.showworkbenchbutton?.value !== false);
  }
  syncVisibility() {
    const hidden = !this.enabled || this.stage.dataset.mode === "boot";
    const entering = this.root.hidden && !hidden;
    const reduced = this.stage.classList.contains("reduce-motion");
    this.root.inert = hidden;
    this.root.setAttribute("aria-hidden", String(hidden));
    if (hidden && !this.root.hidden && !reduced) {
      if (!this.exitAnimation) {
        const animation = this.root.animate([{ opacity: getComputedStyle(this.root).opacity }, { opacity: 0 }], { duration: 220, fill: "forwards", easing: "ease-out" });
        this.exitAnimation = animation;
        animation.onfinish = () => { this.root.hidden = true; animation.cancel(); this.exitAnimation = undefined; };
      }
      return;
    }
    const interrupted = Boolean(this.exitAnimation);
    const opacity = getComputedStyle(this.root).opacity;
    this.exitAnimation?.cancel();
    this.exitAnimation = undefined;
    this.root.hidden = hidden;
    if (interrupted && !hidden && !reduced) this.root.animate([{ opacity }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
    if (entering) {
      [".wb-time", ".wb-today", ".wb-module", ".wb-nav"].forEach((selector, i) => {
        const element = this.root.querySelector<HTMLElement>(selector)!;
        element.getAnimations().forEach(a => a.cancel());
        const base = getComputedStyle(element).translate.split(" ").map(parseFloat);
        const x = base[0] || 0, y = base[1] || 0;
        if (!reduced) element.animate([{ opacity: 0, translate: `${x}px ${y + 9}px` }, { opacity: 1, translate: `${x}px ${y}px` }],
          { duration: 460, delay: 60 + i * 65, easing: "cubic-bezier(.22,.7,.2,1)", fill: "backwards" });
      });
    }
  }
  private laneEnabled(lane: number) { return this.controls.laneEnabled(lane); }
  select(lane: number) {
    if (!this.laneEnabled(lane)) return;
    this.lane = lane;
    this.renderPanel();
  }
  private syncElements() {
    const visibility = this.controls.visibility;
    const selectors = { clock: ".wb-time", tasks: ".wb-today", module: ".wb-module", navigation: ".wb-nav" } as const;
    for (const [key, selector] of Object.entries(selectors)) this.root.querySelector<HTMLElement>(selector)!.hidden = !visibility[key as WorkbenchElement];
    const available = this.controls.lanes;
    this.root.querySelector<HTMLElement>(".wb-module")!.hidden = !visibility.module || !available.length;
    this.root.querySelector<HTMLElement>(".wb-nav")!.hidden = !visibility.navigation || !available.length;
    this.root.querySelectorAll<HTMLButtonElement>("[data-wb-lane]").forEach(button => {
      const index = available.indexOf(+button.dataset.wbLane!);
      button.hidden = index < 0;
      button.querySelector("small")!.textContent = index < 0 ? "" : String(index + 1).padStart(2, "0");
    });
    this.root.querySelector<HTMLElement>(".wb-overview")!.hidden = !visibility.clock && !visibility.tasks;
    this.root.dataset.clockVisible = String(visibility.clock);
    this.stage.dataset.workbenchBrand = String(!this.enabled || visibility.brand);
  }
  private save() {
    try { localStorage.setItem(key, JSON.stringify({ date: this.date, done: this.done, timer: this.timer })); this.storageOK = true; }
    catch { this.storageOK = false; }
    this.root.querySelector(".wb-storage")!.textContent = this.storageOK ? "" : tr("当前无法保存进度，重新加载后可能丢失。");
  }
  private rollDay() {
    const today = dayKey(new Date());
    if (this.date !== today) { this.date = today; this.done = []; this.save(); this.renderTasks(); }
  }
  private renderTasks() {
    const entries = [0, 1, 2].filter(i => this.text(`task${i + 1}`));
    this.root.querySelector(".wb-task-count")!.textContent = entries.length ? `${entries.filter(i => this.done.includes(this.taskId(i))).length} / ${entries.length}` : "";
    this.root.querySelector(".wb-tasks")!.innerHTML = entries.length ? entries.map(i => `<button class="wb-task" data-wb-task="${i}" aria-pressed="${this.done.includes(this.taskId(i))}"><span class="wb-check" aria-hidden="true">${this.done.includes(this.taskId(i)) ? "✓" : ""}</span><span>${escapeHtml(this.text(`task${i + 1}`))}</span></button>`).join("") : tr('<p class="wb-muted">今天想完成什么？<br>在 Wallpaper Engine 属性中填写最多三件事。</p>');
  }
  private actTimer(action: string) {
    const now = Date.now();
    this.settle(now);
    if (action === "reset") this.timer = { ...idleTimer(), phase: this.timer.phase };
    if (action === "phase") this.timer = { ...idleTimer(), phase: this.timer.phase === "focus" ? "break" : "focus" };
    if (action === "toggle") {
      if (this.timer.status === "running") this.timer = { ...this.timer, status: "paused", remaining: timerLeft(this.timer, now), deadline: 0 };
      else {
        const remaining = this.timer.status === "paused" ? this.timer.remaining : this.minutes() * 60000;
        this.timer = { ...this.timer, remaining, deadline: now + remaining, status: "running" };
      }
    }
    this.save(); this.renderPanel();
    this.root.querySelector<HTMLButtonElement>(`[data-wb-timer="${action}"]`)?.focus({ preventScroll: true });
  }
  private settle(now: number, previousTick?: number) {
    if (this.timer.status === "running" && timerLeft(this.timer, now) === 0) {
      const remind = shouldRemindTimer(this.timer, now, previousTick);
      this.timer = { ...this.timer, status: "done", remaining: 0, deadline: 0 }; this.save(); this.renderPanel();
      if (remind && !wallpaperHost()?.paused && !document.hidden) this.onSound("focus-done");
    }
  }
  tick(now = Date.now()) {
    if (Math.floor(now / 1000) === this.lastSecond) return;
    this.lastSecond = Math.floor(now / 1000);
    this.rollDay(); this.settle(now, this.lastTimerTick); this.lastTimerTick = now;
    const date = new Date(now);
    rollText(this.root.querySelector<HTMLElement>(".wb-clock")!, date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), !this.stage.classList.contains("reduce-motion"));
    const dateKey = dayKey(date);
    const dateLocale = `${dateKey}:${language()}`;
    if (this.renderedDate !== dateLocale) {
      const element = this.root.querySelector<HTMLTimeElement>(".wb-date")!;
      const [year, month, day] = dateKey.split("-");
      element.dateTime = dateKey;
      element.setAttribute("aria-label", date.toLocaleDateString(language(), { year: "numeric", month: "long", day: "numeric", weekday: "long" }));
      element.querySelector(".wb-date-year")!.textContent = year;
      element.querySelector(".wb-date-monthday")!.textContent = `${month}.${day}`;
      element.querySelector(".wb-date-weekday")!.textContent = date.toLocaleDateString(language(), { weekday: "long" });
      this.renderedDate = dateLocale;
    }
    if (this.lane === 0 || this.lane === 2) this.renderPanel();
    const timer = this.root.querySelector(".wb-timer-digits");
    if (timer) rollText(timer as HTMLElement, durationText(this.timer.status === "idle" ? this.minutes() * 60000 : timerLeft(this.timer, now)), !this.stage.classList.contains("reduce-motion"));
  }
  private renderPanel() {
    if (this.lane < 0) {
      this.root.querySelector(".wb-title")!.textContent = "";
      this.root.querySelector(".wb-content")!.replaceChildren();
      return;
    }
    this.root.querySelector(".wb-title")!.textContent = tr(names[this.lane]);
    const available = this.controls.lanes;
    this.root.querySelector(".wb-index")!.textContent = `${String(available.indexOf(this.lane) + 1).padStart(2, "0")} / ${String(available.length).padStart(2, "0")}`;
    this.root.querySelectorAll<HTMLButtonElement>("[data-wb-lane]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.wbLane! === this.lane)));
    let html = "";
    if (this.lane === 0) {
      const now = new Date(), end = new Date(now.getFullYear() + 1, 0, 1).getTime(), start = new Date(now.getFullYear(), 0, 1).getTime();
      const percent = (now.getTime() - start) / (end - start) * 100;
      html = tr`<div class="wb-large">${now.getFullYear()}<small>YEAR</small></div><div class="wb-rule"><i style="width:${percent}%"></i></div><p class="wb-muted">今年已走过 ${percent.toFixed(1)}%</p>`;
    }
    if (this.lane === 1) html = tr('<div class="wb-large">03<small>PRIORITIES</small></div><p class="wb-muted">把今天留给最重要的三件事。<br>点击左侧事项标记完成，再点一次撤销。完成状态每天重置。</p>');
    if (this.lane === 2) {
      const text = this.text("eventdate"), target = parseTarget(text), title = this.text("eventname");
      const delta = target === null ? 0 : target - Date.now();
      const days = Math.ceil(Math.abs(delta) / 86400000);
      const dayLabel = language() === "en-US"
        ? `${days === 1 ? "DAY" : "DAYS"} ${delta > 0 ? "TO GO" : "AGO"}`
        : delta > 0 ? "天后" : "天前";
      html = !text ? tr('<p class="wb-empty">留一个值得期待的日子。</p><p class="wb-muted">在 Wallpaper Engine 中填写日程名称与目标日期。</p>') : target === null ? tr('<p class="wb-empty">目标日期格式不正确</p><p class="wb-muted">请填写 YYYY-MM-DD，或 YYYY-MM-DD HH:mm。</p>') : tr`<p class="wb-event">${escapeHtml(title || tr("重要日程"))}</p><div class="wb-large">${days}<small>${dayLabel}</small></div><p class="wb-muted">${delta > 0 ? tr("距离目标") : tr("已到达目标")} · ${escapeHtml(text)}<br>${Math.floor(Math.abs(delta) / 3600000)} 小时 ${Math.floor(Math.abs(delta) / 60000) % 60} 分钟${delta > 0 ? tr("后") : tr("前")}</p>`;
    }
    if (this.lane === 3) {
      const media = window.rhineWallpaperMedia ?? {}, p = media.properties, t = media.timeline;
      const cover = media.thumbnail?.thumbnail;
      const safeCover = typeof cover === "string" && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(cover);
      html = media.status?.enabled === false ? tr('<p class="wb-empty">媒体信息未启用</p><p class="wb-muted">请在 Wallpaper Engine 中启用媒体信息集成。</p>') : !p?.title ? tr('<p class="wb-empty">此刻，留一点安静。</p><p class="wb-muted">在支持系统媒体信息的播放器中播放音乐，歌曲与封面会显示在这里。</p>') : `<div class="wb-media">${safeCover ? tr`<img src="${escapeHtml(cover!)}" alt="专辑封面"/>` : '<div class="wb-cover" aria-hidden="true">♫</div>'}<div><small>${media.playing ? tr("正在播放") : tr("媒体已暂停或停止")}</small><h3 data-wb-roll>${escapeHtml(p.title)}</h3><p data-wb-roll>${escapeHtml(p.artist || "")}</p></div></div>${t && typeof t.duration === "number" && t.duration > 0 && Number.isFinite(t.duration) && typeof t.position === "number" && Number.isFinite(t.position) ? `<div class="wb-rule"><i style="width:${Math.max(0, Math.min(100, t.position / t.duration * 100))}%"></i></div><p class="wb-muted"><span data-wb-roll>${durationText(t.position * 1000)}</span> / <span data-wb-roll>${durationText(t.duration * 1000)}</span></p>` : ''}`;
    }
    if (this.lane === 4) html = tr`<div class="wb-timer-label">${this.timer.phase === "focus" ? tr("专注") : tr("休息")} · ${this.timer.status === "done" ? tr("已结束") : this.timer.status === "running" ? tr("进行中") : this.timer.status === "paused" ? tr("已暂停") : tr("准备开始")}</div><div class="wb-large wb-timer-digits" data-wb-roll>${durationText(this.timer.status === "idle" ? this.minutes() * 60000 : timerLeft(this.timer, Date.now()))}</div><div class="wb-timer-buttons"><button data-wb-timer="toggle">${this.timer.status === "running" ? tr("暂停") : this.timer.status === "paused" ? tr("继续") : tr("开始")}</button><button data-wb-timer="reset">重置</button><button data-wb-timer="phase">${this.timer.phase === "focus" ? tr("转入休息") : tr("开始专注")}</button></div><p class="wb-muted">${this.timer.status === "done" ? tr("这一段时间已完成。准备好后再开始下一段。") : tr("暂停壁纸或重新加载后按实际时间校正。")}<br>时长在 Wallpaper Engine 中设置。</p>`;
    patchRollingPanel(this.root.querySelector<HTMLElement>(".wb-content")!, html, !this.stage.classList.contains("reduce-motion"));
    this.root.querySelector(".wb-storage")!.textContent = this.storageOK ? "" : tr("当前无法保存进度，重新加载后可能丢失。");
  }
}
