# 启动失败诊断与字体容错

2026-10-09。用户截图中的 `CONNECTION INTERRUPTED` 来自 `start()` 的统一 catch；此前模型、WebGL、字体以及其他启动异常共用“开启硬件加速”提示。修改前已在本地壁纸构建中分别模拟字体 404（包括关闭 3D）、模型 404、WebGL 不可用，三者都出现相同旧提示。

## 修改

- 字体准备有独立异常处理与 8 秒上限；失败、同步异常和超时都记录 `STARTUP_FONT_FALLBACK`，继续以现有字体栈和 `font-display: swap` 启动，不修改字体文件或正常字体选择。加载稍晚的字体仍可生效。
- 对模型 GLB 读取／解析、内嵌标签 SVG 解码分别保留资源与 cause；错误页显示 `MODEL_RESOURCE`、`LABEL_RESOURCE`。渲染器初始化错误区分 `WEBGL_INIT` / `THREE_INIT`，其他阶段有 `THREE_SCENE` / `STARTUP`。
- Wallpaper Engine 错误提示采用本地资源／宿主用语；普通网页采用网络／浏览器用语。中英文本均提供，原始错误按纯文本显示并限制长度，避免把错误中的 HTML 当作页面内容。
- 失败时清理已构造完成的场景并停止旧 StartupGate 的监听与音频入口请求；错误页聚焦重载按钮，支持窄屏换行与滚动。

## 验证

使用独立无界面的 Edge、全新浏览器上下文、本地静态服务与真实生产构建。壁纸测试模拟宿主属性，不连接用户的日常浏览器，不修改桌面壁纸。

运行方式（需要可用的 Playwright；可通过 `PLAYWRIGHT_MODULE` 指定模块目录）：

```powershell
npm run build:wallpaper
node scripts/check-startup-failure.mjs
npm run build
node scripts/check-startup-failure.mjs --web
```

壁纸 10 项通过：正常启动、字体缺失且 3D 开／关、字体永久挂起后超时、字体同步异常、模型缺失、模型损坏、标签解码失败、WebGL 不可用、英文模型错误。字体异常均正常进入且解除界面输入隔离；三维故障释放画布，错误类型正确，无未捕获脚本异常。

网页 4 项通过：正常入口、字体缺失后入口仍可用、模型缺失、WebGL 不可用。验证模型恢复后点击重载能回到就绪状态；旧入口 Tab 处理不再阻碍错误页键盘导航。

错误页检查 1280×720 与 390×844；长资源地址换行且不横向溢出。标签解码故障中注入 HTML 形式的错误字符串，页面未创建对应元素。截图已目视检查模型缺失桌面／竖屏布局。

- [壁纸结果](startup-failure/wallpaper-results.json)
- [网页结果](startup-failure/web-results.json)
- [桌面错误页](startup-failure/model-missing.png)
- [竖屏错误页](startup-failure/model-missing-portrait.png)

两类构建、`scripts/check-wallpaper.mjs`、`scripts/check-localization.mjs --content-only` 均通过。

本次未在真实 Wallpaper Engine CEF 中重跑，也未取得截图反馈者的运行日志。验证证明错误分类和字体容错生效，不代表已经确定或修复该机器可能存在的模型文件或显卡驱动问题。新版错误代码与原始信息可用于继续定位。
