# 中英文与设置入口

在 Wallpaper Engine 的壁纸属性顶部选择「语言 / Language → 简体中文 / English」，即时生效并由宿主保存。默认简体中文，旧用户升级后保持原语言与配置；其他属性的键和值未改名。壁纸内部设置按钮、弹窗及 WE「显示设置入口」已移除，所有长期配置统一在 WE 属性调整。右下角原有重播与左下角 3D 开关继续保留。

中文模式保持原有中英混排。已有英文标识、2D 开场的英文文字、Novecento 字形和时间轴不随语言改变；仅将原中文功能、提示和档案内容补齐英文本地化。用户姓名、事项、日程标题以及系统媒体信息保持用户或播放器原文。

WE 普通属性名称和下拉选项的翻译跟随 **WE 软件自身的界面语言**，由 `wallpaper/project.json` 的 `general.localization` 提供；折叠分组标题直接显示中英双语，兼容 WE 对分组翻译的字符编码问题。壁纸内内容由新增 `language` 属性控制。壁纸不会更改 WE 软件语言。官方说明：https://docs.wallpaperengine.io/en/web/customization/localization.html

## 维护

- `content/ui.en.json`：原中文文案与英文译文对应表；`tr` 只处理开发者写入的字符串或模板静态片段，不处理模板插入的用户数据。
- `content/archives.json` 与 `content/archives.en.json`：各 40 份中文／英文档案，编号、排列、分类所属和原英文眉题对应。两套正文共用原设定来源，翻译没有新增剧情。
- `src/i18n.ts`：即时语言状态与静态界面绑定。静态文本原位更新，不持续观察 DOM；动态内容由所属模块刷新。语言由 WE 保存，页面不写另一份语言偏好。
- 导出分别位于 `archives/` 和 `archives/en/`，下载跟随当前语言，原中文下载路径仍有效。
- 固定英文开场继续由原有 `boot-*` 和 `workbench-lettering` 实现，不能按语言切换替换其美术文字。

静态界面绑定必须在填入用户内容之前调用。新增动态状态时，保持中文原始状态／稳定 ID，显示时翻译；不要把显示标签作为存储标识。语言更新不得重新初始化场景、选择档案或启动计时器。

## 字体说明

界面不再显示字体许可入口。软件包根目录 `THIRD-PARTY-NOTICES.txt` 明确注明使用 MiSans，字体目录保留版权、来源和完整许可文件。官方条款要求在软件中注明使用 MiSans，未指定必须显示在常规任务界面；本项目将声明随软件交付。来源：https://hyperos.mi.com/font/en/faq/ 。不改变或重新生成字体文件；公开包仍排除 MyFonts 字体二进制。

## English

Choose **Language / 语言 → English** at the top of this wallpaper's properties in Wallpaper Engine. The choice applies immediately and is saved by Wallpaper Engine. Use that panel for all persistent configuration; the wallpaper no longer has an internal settings dialog. Replay remains at the bottom right, and the 3D toggle remains at the bottom left.

Existing English graphics and opening animation remain unchanged. Workspace tools, hints, the model viewer, the game and all 40 archive records have English translations. Your names, tasks, event titles and media metadata remain as supplied. Language changes preserve the active archive, saved records, focus timer and model viewer state.

Property labels and dropdown options follow Wallpaper Engine's own interface language. Group headings show both Chinese and English to avoid a host text-encoding issue. The wallpaper's Language option controls its on-screen content. These are separate settings. Font notices and licenses are included in the software package rather than the wallpaper interface.

Validation and limitations: `verification/LOCALIZATION.md`.
