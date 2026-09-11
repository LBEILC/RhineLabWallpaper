# 登录身份与自动明暗切换验证 · 2026-09-11

用户要求在 Wallpaper Engine 设置中增加两项能力：可修改的登录人姓名（默认保持现有设置）与按自定义时间自动切换深色／浅色模式。沿用现有原生实现、属性分组与明暗过渡，不引入新依赖。

## 功能与实现

- `src/session.ts`：会话姓名状态。修剪首尾空白、折叠连续空白与控制字符；空串、纯空白、非字符串回落到 `JOYCE MOORE`；上限 24 个码点（避免截断代理对）。
- `src/auto-theme.ts`：调度纯逻辑。`enabled` 关闭时返回 `null`（保留手动配色）；两个时间相同也返回 `null`（不自动切换）；否则按本机时间判断当前是否落在暗色区间，区间可跨午夜；宿主传入越界或非法数值时按 0–23／0–59 收敛或回落到 19:00／07:00。
- `src/boot-motion.ts`：开场身份确认行改为读取当前姓名。仍使用原片 321–339 帧的输入窗口，姓名长度只改变每字步长，时间轴与周边文案不变。
- `src/workbench-lettering.ts`、`src/workbench.css`：默认姓名继续输出既有 Novecento 固定字形；其他姓名输出经过转义的实时文本（`.wb-lettering-custom`，字距 0.065em，超长省略）。因此自定义姓名无需重新导出字形，也不受 MyFonts 授权限制。
- `src/main.ts`：页脚姓名、设置页眉、访问记录、开场共用同一姓名状态；`apply()` 读取 `sessionname` 与调度属性；每秒一次的时间刻度检查边界，仅在计算目标变化时应用，避免同一时段内反复打断手动选择。
- `wallpaper/project.json`：新增可折叠分组「登录身份」与 `sessionname`（textinput，默认 `JOYCE MOORE`）；「入场与画面」新增 `autotheme`（bool，默认关闭）与 `darkstarthour`／`darkstartminute`／`lightstarthour`／`lightstartminute`（slider，默认 19:00 与 07:00），后四项带 `autotheme.value == true` 条件显示。

交互约定：自动切换开启时，手动配色（WE 下拉或壁纸内设置按钮）立即生效，但下一次跨越配置时间点会被自动结果覆盖；关闭自动切换即完全回到手动配色。壁纸内设置页在开启时显示当前时段说明。

## 检查

`node scripts/check-identity-theme.mjs`（通过）：

- 姓名：默认值、`undefined`／`null`／数字、纯空白与控制字符、连续空格折叠、40 字符截断、24 个 emoji 按码点截断、还原默认值。
- 页脚字形：默认姓名与相同主机值仍使用字形图形；自定义姓名改用实时文本并完成 HTML 转义（`'`、`<`、`>`、`&`）；`session`／`replay` 固定文案不受影响。
- 开场：帧 340 输出 `ID CONFIRMED : …` 全名（默认、自定义、中文、24 字符），输入起点仍为空，揭示过程保持递增。
- 调度：关闭、跨午夜、同日区间、两侧边界（含端点）、两个时间相同、越界与非数值回落、属性表默认值与 `condition`、属性 `order` 唯一且位于「入场与画面」区间。

`node scripts/check-identity-theme-host.mjs`（通过）：真实 Wallpaper Engine 宿主窗口（`wallpaper64.exe`，关闭 3D 与开场，注入探针并通过回环上报）复现 640×360 实际渲染，覆盖：

| 场景 | 结果 |
| --- | --- |
| 启动时调度为暗色、手动值为 light | `darkSurface=true`，手动值仍保存为 light |
| 开场自定义姓名 | `ID CONFIRMED : KAL'TSIT`，使用文本回落，字号仍为 21.35px |
| 开场默认姓名 | `ID CONFIRMED : JOYCE MOORE`，identity 字形，26 个字母全部显示 |
| 运行时切到亮色区间 | `darkSurface=false` |
| 此刻手动切暗色 | 立即变暗，未被下一次检查打断 |
| 再跨越一次边界 | 自动结果重新覆盖手动选择 |
| 运行时改名（含 `&` 与 `<b>`） | 页脚与设置页眉显示原始文本，未注入标签 |
| 姓名清空 | 回落 `JOYCE MOORE` 与字形图形 |
| 关闭自动切换后手动配色 | 手动暗色生效 |

结果保存在 `verification/identity-theme/host-results.json`；脚本结束会删除宿主临时工程目录。

## 限制与未验证项

- 调度使用系统本地时间；宿主未提供时区或计划任务接口，因此夏令时跳变按系统时钟自然跟随。
- 自动化只覆盖 640×360 宿主窗口与关闭 3D 的场景；3D 开启时的逐张变色过渡沿用既有 `verification/THEME.md` 结论，本次未重新截取暗色阵列画面。
- 姓名上限 24 个码点是为单行身份行与页脚预留；更长姓名会被截断而不是换行。
