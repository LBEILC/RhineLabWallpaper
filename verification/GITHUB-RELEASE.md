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

相同构建内容连续两次打包得到相同 SHA-256（`db572c4c24c349c895ef98a3f8a995e6491a427df24f1bc6c2bffc548e48ce99`），因为 zip 条目时间戳固定为常量。这使发布包可以用哈希比对，也便于确认 CI 与本地构建一致。

## 修复的既有问题

`node scripts/check-wallpaper.mjs` 在本轮之前已经失败：`wallpaper/host.js` 增加了 `location.protocol` 判断，而校验用的 VM 上下文没有提供 `location`，脚本在加载宿主脚本时抛 `ReferenceError`。现在为 VM 提供 `location: { protocol: "file:" }` 与 `performance`，检查恢复通过。该修复是发布工作流的前置条件。

## CI 首次运行

GitHub Actions 工作流 `.github/workflows/wallpaper-release.yml` 在推送到 `main` 后触发，构建、打包、校验并刷新滚动发布 `latest`。首次运行结果：

- 推送当时本机到 GitHub 的连接失败（`v2rayN` / `sing-box` 本地代理 10808 端口 TLS 握手失败，直连 api.github.com 超时），因此该次运行尚未发生；工作流文件、打包脚本与校验脚本已在本地完整跑通。
- 恢复网络后需执行 `git push origin main`，随后用 `gh run watch`、`gh release view latest` 确认发布页附件。

## 限制与未验证

- 这个压缩包**没有**在本机 Wallpaper Engine 中实际加载过。本地加载路径本身沿用此前已验证的记录（`myprojects` 目录下的工程可在“已安装”中出现），但本压缩包解压后的工程尚未在宿主中应用。
- 未验证 Steam 反垃圾标记的解除时间，也未验证中国大陆网络下未经代理访问 GitHub Releases 的速度。普通用户下载 33.7 MiB 压缩包需要能访问 GitHub。
- 未做 `v*` 标签发布的实跑验证；`workflow_dispatch` 同理，两者与 `main` 推送共用同一段打包与发布步骤。
- 工作流使用仓库 `GITHUB_TOKEN` 发布，未测试组织级 Actions 权限受限时的 403 分支。
