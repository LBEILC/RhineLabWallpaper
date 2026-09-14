# 中英文与统一设置验证（2026-09-14）

工作分支：`codex/english-localization`，基线 `3e8b8ba`。延续原生界面与既有美术，未修改前段 2D 开场、字体资源或模型资源。

## 内容与兼容

- 两种语言各 40 份档案，共 80 份 UTF-8 TXT。编号、顺序、每列八份、分类所属、原英文眉题和设定来源逐项对应；英文正文与页面/下载共用数据。
- 全部原有 WE 属性键、值、范围、排序、条件逐项对比基线保持一致；仅移除 `showsettings` 并新增默认 `zh-CN` 的 `language`。
- WE 属性分组、标签和下拉选项均有 `en-us` / `zh-chs` 翻译。语言选项中的语言自称保持可辨识。
- 壁纸构建不渲染设置按钮，`openModal` 拒绝壁纸设置弹窗；旧 `showsettings` 回调及模拟旧按钮点击无法恢复入口。重播与 3D 开关保留。
- 字体通知放在软件包根目录，完整 MiSans 许可与来源仍在字体目录；ZIP 校验确认这些文件随包交付，公开包继续不含 MyFonts 字体二进制。
- 原中文内容及原英文美术文件无改动；中英文的差异只来自新增翻译表及对应界面标签。基线对比检查覆盖 `boot.ts`、`boot-motion.ts`、`boot-lettering.ts`、字形数据、品牌与工作台固定英文图形。

## 浏览器运行

`scripts/check-localization.mjs` 使用 Edge 153.0.4234.32、真实构建产物和 Three.js 场景。结果见 `localization/results.json`。

- 英文宿主初始回调、重新载入与部分/无效属性回调。
- 语言切换保留专注截止时间、事项完成状态；刻意将用户事项和歌名设为与 UI 相同的中文“今日事项”，仍保留原文。
- 选中 X-040、进入研究记录、收藏后双向切换，保持档案、页签、收藏与同一 WebGL canvas；导出指向相应语言。
- 打开 360° 查看器并拆解后切换，保留同一模型 canvas、拆解状态和标题，关闭可返回原入口焦点。
- 检索输入、当前分类、结果数量在切换后保留。小游戏入口、退出与当前提示翻译正常。
- 1920×1080、2560×1440 和 390×844 检查工作台文字边界；英文桌面导航适度加宽。检查暗色 HUD、英文详情、检索与拆解查看器截图。竖屏工作台按原规则独立滚动，截图展示的首屏不是全部内容。
- 无 JavaScript 页面错误。截图使用性能画质以控制测试成本，不作为原始画质的视觉对照。

## 实际 Wallpaper Engine

`scripts/check-localization-host.mjs` 通过独立离屏诊断工程运行，读取真实 `file:` 宿主初始语言属性；未替换桌面壁纸。WE CEF 为 Chromium 146，结果见 `localization/host.json`。

- 启动读取 English，工作台正常显示英文；后续模拟宿主增量回调双向切换，保留计时与事项。
- 旧设置入口属性无效。
- 定位开场实际身份确认时刻，确认已显示 `ID CONFIRMED : JOYCE MOORE`；同步切换语言前后，对比 `#boot` 内部 DOM/字形完整相同。
- 属性面板翻译按官方 `general.localization` 格式和双语条目完整性验证；未更改本机 WE 软件语言来截取英文宿主属性面板。

## 命令

```powershell
npm run build:wallpaper
npm run check:content
node scripts/check-workbench.mjs
node scripts/check-wallpaper.mjs
node scripts/check-localization.mjs --content-only
# PLAYWRIGHT_MODULE 可指向本机 Playwright 包，或使用已安装的 playwright。
node scripts/check-localization.mjs
node scripts/check-localization-host.mjs
npm run build
npm run pack:wallpaper
npm run check:wallpaper-release
```

浏览器小视口为桌面 Edge 模拟，未声称本轮通过真实手机验收。中英文翻译已逐份完成与语义复核，未经过独立母语编辑审校。工坊上传仍由用户执行。
