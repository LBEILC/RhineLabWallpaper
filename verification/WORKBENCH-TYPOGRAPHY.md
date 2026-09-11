# 工作台字体验证

2026-09-11：沿用原生工作流，新增五段 Novecento Normal 固定矢量文案。

- Edge 无头浏览器 1920×1080 实际运行：五段图形显示，文本仍保留，无页面横向溢出。
- 切回档案展示后，页脚三段 SVG 均 display:none，恢复既有文本显示。
- 构建包含 TypeScript 检查；无 Novecento 字体文件进入发行包。
- 工作台及数字对照截图位于 reference/workbench-typography/。
- 数字仅提供静态字形对照，未实现或声称验收 Novecento 数字滚动；正式数字仍使用原实现。
- 本轮未进行 Wallpaper Engine 宿主内视觉验收。

重新生成固定文案需 Pillow 与 fonttools 4.59.2：
`python scripts/make-workbench-lettering.py --font <licensed-Normal.otf>`
