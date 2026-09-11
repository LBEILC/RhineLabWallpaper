# GitHub 构建包与本地发布验证（2026-09-11）

任务：创意工坊条目被 Steam 标记为“与 Wallpaper Engine 不兼容”期间，提供不依赖创意工坊的下载渠道——每次构建后在 GitHub 发 Release，用户下载后放进 Wallpaper Engine 的 `projects\myprojects` 本地加载。

## 起因核对

条目页当前确实带着该提示。Wallpaper Engine 官方排错文档写明这是自动垃圾内容检查的临时状态，作者无需处理（[从搜索中排除某些壁纸](https://help.wallpaperengine.io/zh/interface/exclude.html)）：

> 如果您上传的壁纸被标记为不兼容，这是因为它触发了反垃圾内容检查。您无需进行任何操作，只需耐心等待垃圾内容检查通过即可。这通常会在几小时内完成。

同期抓取的条目页仍正常显示 `Subscribe`、222 位订阅者与 `Type: Web`，因此这不是工程损坏，也不应为此重建条目。结论已写入 docs/WORKSHOP-PUBLISH.md 与 docs/GITHUB-RELEASE.md。

## 本地验证环境

- Windows，Node v24.14.0，npm 11.16.0
- 命令：`npm run release:wallpaper`（= `build:wallpaper` → `pack:wallpaper` → `check:wallpaper-release`）

## 结果

| 步骤 | 结果 |
| --- | --- |
| `npm run build:wallpaper` | `release/wallpaper`，825 个文件，35.2 MiB |
| `npm run pack:wallpaper` | `release/RhineLabWallpaper-latest.zip`，826 个工程条目 + 根目录 `INSTALL.txt`，35,362,979 字节（33.7 MiB） |
| `node scripts/check-wallpaper-release.mjs` | 全条目 CRC、结构、清单通过：826 工程文件、2 个 GLB、753 个 woff2、40 份档案文本 |
| `node scripts/check-wallpaper.mjs` | 宿主属性、限帧、暂停恢复与 CEF 安全画质控件通过 |
| `npm run check:content` | 通过 |

压缩包内 `RhineLabWallpaper/project.json` 的 `description` 与 `docs/WORKSHOP-DESCRIPTION.txt` 逐字一致，`workshopid` 保留 `3799142774`。

### 用第三方解压器复核

Windows 自带 `Expand-Archive`（.NET `ZipFile`，与自写 zip 实现无关）解压成功：

- 根目录得到 `RhineLabWallpaper/` 与 `INSTALL.txt`；`INSTALL.txt` 为 UTF-8 BOM + CRLF，中文在旧版记事本与 PowerShell 5.1 下也能正确识别。
- 工程内文件数 826，抽样 `assets/index-*.js` 的 SHA-256 与 `release/wallpaper` 中同名文件一致。
- `.sha256` 文件内容与 `Get-FileHash -Algorithm SHA256` 的结果一致。

### 授权字体

- `public/fonts/novecento` 在本机检出中不存在，构建与压缩包中 `novecento` 条目数为 0。
- 打包脚本对误打包授权字体会直接失败；校验脚本再次断言压缩包中不含该目录。因此 GitHub 上的公开发布只包含可再分发资源，Novecento 位置使用仓库内置固定字形图形。

### 可重复打包

相同构建内容连续两次打包得到相同 SHA-256（`db572c4c24c349c895ef98a3f8a995e6491a427df24f1bc6c2bffc548e48ce99`），因为 zip 条目时间戳固定为常量。这使发布包可以用哈希比对。跨平台不可比：Windows 检出的文本文件是 CRLF、Linux 检出是 LF，压缩前的字节不同，见下文 CI 复核。

## 修复的既有问题

`node scripts/check-wallpaper.mjs` 在本轮之前已经失败：`wallpaper/host.js` 增加了 `location.protocol` 判断，而校验用的 VM 上下文没有提供 `location`，脚本在加载宿主脚本时抛 `ReferenceError`。现在为 VM 提供 `location: { protocol: "file:" }` 与 `performance`，检查恢复通过。该修复是发布工作流的前置条件。

## CI 首次运行

GitHub Actions 工作流 `.github/workflows/wallpaper-release.yml` 在推送到 `main`（提交 `3f23d0d`）后触发，构建、打包、校验并发布：

- 运行记录：<https://github.com/LBEILC/RhineLabWallpaper/actions/runs/34580950646>，job `package` 全部步骤成功，用时 37 秒。
- 步骤依次为：`npm ci` → `check:content` → `build:wallpaper` → `check-wallpaper.mjs` → 解析标签 `latest` → 打包 → `check-wallpaper-release.mjs` → 上传 workflow artifact → 发布 GitHub Release。
- 发布结果：<https://github.com/LBEILC/RhineLabWallpaper/releases/tag/latest>，标题 `Rhine Lab · 莱茵生命交互桌面（latest）`，非草稿、非预发布，包含两项附件：

| 附件 | 大小 |
| --- | --- |
| `RhineLabWallpaper-latest.zip` | 35,362,748 字节 |
| `RhineLabWallpaper-latest.zip.sha256` | 95 字节 |

首次运行只出现一条 `Node.js 20 is deprecated` 注解（`checkout@v4`、`setup-node@v4`、`upload-artifact@v4` 被强制运行在 Node 24 上），已改用三个 action 的 v5 版本，功能不受影响。

### 对已发布产物的独立复核

用 `gh release download latest` 取回 GitHub 上的附件后：

- `Get-FileHash -Algorithm SHA256` 的结果与附件 `.sha256` 内容一致（`882ae8eb…e6665`）。
- `node scripts/check-wallpaper-release.mjs` 直接在下载到的压缩包上通过：826 个工程文件、2 个 GLB、753 个 woff2、40 份档案文本，全部 CRC 正确。
- 解压后与本机 `release/wallpaper` 逐文件比对：826 个文件中 810 个 SHA-256 一致，包括两个 GLB、全部 753 个 woff2、`assets/index-*.js` 与 `assets/index-*.css`。差异只出现在 15 个文本文件（`index.html`、`LICENSE`、`favicon.svg`、`build-files.json` 及若干 `*.txt`/`*.json`），内容逐行相同，差别是本机检出为 CRLF、CI 检出为 LF；`build-files.json` 记录的字节数随之差出相应的换行字节数。
- 因此 CI 与本地产物的页面代码一致；压缩包整体哈希在两平台之间不可比（压缩前的换行差异会让 zlib 输出不同），可重复性结论仅适用于同一平台的重复打包。

### 推送当时的网络故障（环境记录）

首次推送时本机完全无法访问 GitHub：Windows 系统代理指向 `127.0.0.1:10808`，该端口可连接但 `git`/`curl` 对所有 HTTPS 都握手失败，直连 `github.com:443` 超时，浏览器也因此打不开任何网页。排查结果：

- `ping`、直连 `http://www.baidu.com` 正常，说明基础网络没问题；系统代理是唯一故障点。
- v2rayN 7.19.5（管理员身份运行）生成的 `binConfigs/config.json` 中，节点 `subvl-v01.zarelaypro.com:57788`（VLESS + REALITY）本身可达，但它被配置为经 `dialerProxy: tun-protect-ss` 走本地 `127.0.0.1:59421`，而 59421/59422 当时并未监听——本地中转链断了，出站流量因此全部卡死。
- 恢复后同一命令重试成功（第 7 次尝试，约 6 分钟），随后代理端口恢复正常。若再次出现“所有网页都打不开”，先重启 v2rayN 核心或换节点即可；本仓库的发布流程本身不依赖该环境。

## 限制与未验证

- 这个压缩包**没有**在本机 Wallpaper Engine 中实际加载过。本地加载路径本身沿用此前已验证的记录（`myprojects` 目录下的工程可在“已安装”中出现），但本压缩包解压后的工程尚未在宿主中应用。
- 未验证 Steam 反垃圾标记的解除时间，也未验证中国大陆网络下未经代理访问 GitHub Releases 的速度。普通用户下载 33.7 MiB 压缩包需要能访问 GitHub。
- 未做 `v*` 标签发布的实跑验证；`workflow_dispatch` 同理，两者与 `main` 推送共用同一段打包与发布步骤。
- 工作流使用仓库 `GITHUB_TOKEN` 发布，未测试组织级 Actions 权限受限时的 403 分支。
