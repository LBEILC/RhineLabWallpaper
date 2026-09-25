# 页脚与按需工作台验证

日期：2026-09-25。采用项目既有原生实现，需求见 [功能记录](../docs/FEATURE-REQUESTS-2026-09-25.md)。

## 状态、计时与运动

check-workbench-controls.mjs 通过：全关默认、完整显示、恢复最新宿主配置、临时模式、独立页脚、编号及提醒条件。对比原算法确认 0–200% 保持一致；300% 三种样式均有界，流波样本峰值约 3.6314，低于理论上界 3.96。

相关回归通过：check-workbench.mjs、check-wallpaper.mjs、check-playground.mjs、check-visual-effects.mjs、check-local-sound.mjs、check-localization.mjs --content-only。

## 浏览器运行与画面

check-workbench-controls-browser.mjs 使用构建后的壁纸及注入的 WE 回调，在 Edge 153.0.4234.48 执行，结果 [browser.json](workbench-controls/browser.json)，无页面异常。

- 隐藏页脚信息后入口可用，恢复最新宿主配置，重载清除临时状态。
- 两处编号一致，任务和计时跨切换保留；点击音、一次完成提醒、静音及暂停恢复通过。
- 1920×1080、2560×1440、1600×900 位置偏移通过，包含 HUD 曲面与全局下边距组合。
- 明暗及竖屏截图检查通过，窄屏两个新按钮同处独立行。
- 快速打断切换、保留三维画布及选档通过。
- 三种律动使用持续模拟宿主频谱检查 300% 运动和画面边缘。此项未使用真实外部播放器采集。

画面：[工作台](workbench-controls/workspace-3d.png)、[暗色页脚](workbench-controls/dark-footer.png)、[竖屏页脚](workbench-controls/portrait-footer.png)、[原版 300%](workbench-controls/music-300-legacy.png)、[频谱 300%](workbench-controls/music-300-wave.png)、[流波 300%](workbench-controls/music-300-lift.png)。

## 真实 Wallpaper Engine

check-workbench-controls-host.mjs 使用独立诊断窗口，1600×900、CEF Chrome 146，追加独立声音开关检查后共 18 项通过，结果 [host.json](workbench-controls/host.json)。结束后关闭诊断窗口，未切换桌面壁纸。

验证真实宿主默认值、部分属性更新、隐藏信息后的入口、连续编号、HUD 位置、档案模式、英文按钮、提醒及暂停不补响、操作音。另验证关闭点击音不影响提醒，关闭提醒不影响点击，部分属性更新保留两个开关，重新启用提醒不补响，总开关同时静音并可恢复。Web Audio 为 running，三次应提醒的完成共调度 focus-done 三次，其余完成静音；UI 点击声八次。以上确认播放链路和次数，最终听感由用户试听评价。

check-we-property-labels.mjs 使用本机 WE 属性模板检查中英文各 168 个标签，通过，见 [标签记录](localization/property-labels.json)。

## 使用边界

区域外移限制到视口边缘，不主动避让其他区域。完整工作台不覆盖页脚显隐。页面临时状态不写回 WE；任务和专注进度按原规则独立保存。

## 构建与本地交付

正式网页和壁纸构建均通过。已同步到本机 rhine-lab-workshop 工程，逐文件校验 868 个资源一致，保留 74 项已有属性值、工程标题与 workshopid，并更新页脚分组顺序及本地化。原 project.json 备份在 backups/workbench-controls-2026-09-25/project.json（仅本机）。未操作创意工坊上传；重新载入本地壁纸后使用新功能。
