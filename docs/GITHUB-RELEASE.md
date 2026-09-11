# GitHub 构建包与本地加载

创意工坊条目在 Steam 反垃圾内容检查期间会被标记为 **“此物品与 Wallpaper Engine：壁纸引擎 不兼容”**。Wallpaper Engine 官方说明这不需要作者处理，等待检查通过（通常几小时）即可：

> 如果您上传的壁纸被标记为不兼容，这是因为它触发了反垃圾内容检查。您无需进行任何操作，只需耐心等待垃圾内容检查通过即可。这通常会在几小时内完成。—— [从搜索中排除某些壁纸](https://help.wallpaperengine.io/zh/interface/exclude.html)

即使条目页出现该提示，其他人仍可能正常订阅；不过为了不依赖这条渠道，本仓库在每次推送到 `main` 后自动构建并发布一个可直接加载的压缩包。任何人都可以从 GitHub 下载、解压，然后在 Wallpaper Engine 中本地加载，不需要订阅创意工坊。

## 下载

- 最新构建：<https://github.com/LBEILC/RhineLabWallpaper/releases/latest>
- 文件：`RhineLabWallpaper-latest.zip`（约 30–40 MB）与 `RhineLabWallpaper-latest.zip.sha256`
- 打上 `v*` 标签的正式版本会另建永久发布页，例如 `RhineLabWallpaper-v1.0.0.zip`。

压缩包内是完整的 Wallpaper Engine 网页壁纸工程（`index.html`、`project.json`、模型、音频、字体子集、档案文本、许可），不包含源码、Blender 工程和开发工具。

## 安装（Windows）

1. 下载并解压 `RhineLabWallpaper-latest.zip`，得到一个 `RhineLabWallpaper` 文件夹。压缩包根目录另有一份 `INSTALL.txt`，内容与此处相同。
2. 找到 Wallpaper Engine 的本地工程目录。在 Steam 库中右键 **Wallpaper Engine → 管理 → 浏览本地文件**，进入：

   ```text
   ...\steamapps\common\wallpaper_engine\projects\myprojects\
   ```

3. 把整个 `RhineLabWallpaper` 文件夹复制进 `myprojects`。
4. 打开 Wallpaper Engine，切到 **已安装**，搜索 `Rhine Lab`，选择 **Rhine Lab · 莱茵生命交互桌面**（或标题中包含 `RhineLabWallpaper` 的副本）。
5. 点击应用即可作为桌面壁纸。属性面板与创意工坊版完全一致：工作模式、今日事项、日程、声音、音乐律动、配色、HUD 与画质等都在这里设置。

也可以按官方导入方式操作：在 Wallpaper Engine 编辑器中，把解压目录里的 `index.html` 拖到 **创建壁纸 / Create Wallpaper** 按钮上，编辑器会复制一份工程到 `myprojects`。[官方说明](https://docs.wallpaperengine.io/en/web/first/gettingstarted.html)

### 一次都不想解压？

Wallpaper Engine 只能从本地工程目录读取网页壁纸，所以至少要解压一次到 `myprojects`。之后更新只需覆盖这个文件夹。

## 更新

1. 下载新的 `RhineLabWallpaper-latest.zip`。
2. 备份工程内的 `project.json`（如果你在属性面板里改过设置，Wallpaper Engine 可能把值写在这里）。
3. 用新包中的 `RhineLabWallpaper` 文件夹覆盖 `myprojects\RhineLabWallpaper`，再把备份的 `project.json` 放回。
4. 在 Wallpaper Engine 中重新载入壁纸，或重新打开壁纸界面。

工程目录名或标题变化都会被 Wallpaper Engine 视为另一个壁纸，属性值可能重置；更新时保持 `RhineLabWallpaper` 这个名字最稳妥。

## 校验下载

```powershell
Get-FileHash .\RhineLabWallpaper-latest.zip -Algorithm SHA256
Get-Content .\RhineLabWallpaper-latest.zip.sha256
```

两处哈希一致即可确认文件完整。压缩包内的每个文件都由构建脚本记录在 `build-files.json` 中。

## 与创意工坊版的差异

- 功能、属性面板、资源、许可完全一致，都来自同一份构建脚本。
- 包内**不包含**仅供本机使用的 MyFonts 授权字体（`public/fonts/novecento` 在仓库中也被排除）；这些位置的文字使用仓库内置的固定字形图形，与工坊版显示一致。
- 不含 Steam 创意工坊关联信息以外的任何账号数据；`project.json` 中的 `workshopid` 仅用于工坊更新，本地加载不受影响。
- 非官方同人作品；角色、名称与世界观归原权利方所有。

## 维护者流程

本地生成一份完整发布包：

```sh
npm ci
npm run release:wallpaper
node scripts/check-wallpaper-release.mjs release/RhineLabWallpaper-dev.zip
```

- `npm run build:wallpaper` 输出 `release/wallpaper`。
- `npm run pack:wallpaper` 打包为 `release/RhineLabWallpaper-<标签>.zip`，并写出 `.sha256` 与 `release/release-notes.md`。
- `npm run check:wallpaper-release` 读取压缩包，校验 CRC、工程结构、相对路径、文件清单，并拒绝任何误打包的授权字体。

自动发布由 [`.github/workflows/wallpaper-release.yml`](../.github/workflows/wallpaper-release.yml) 完成：

| 触发 | 结果 |
| --- | --- |
| 推送到 `main` | 重新构建并刷新滚动发布 `latest`（标题、说明与资源就地更新，不新建条目） |
| 推送 `v*` 标签 | 用该标签创建永久发布（`--verify-tag`，标签必须是已推送的版本） |
| 手动运行 workflow | 可指定标签，用于补发或修复一次发布 |

工作流使用仓库自带的 `GITHUB_TOKEN`，需要 **Settings → Actions → General → Workflow permissions** 允许读写（默认的 `Read and write permissions` 即可）。若发布步骤报 403，先检查这里。

发布内容不进入 Git：`release/` 已在 `.gitignore` 中，只有 GitHub 发布页持有构建产物。

## 常见问题

- **在“已安装”里找不到**：确认文件夹层级是 `myprojects\RhineLabWallpaper\project.json`，多套一层目录会让 Wallpaper Engine 忽略它。回到壁纸选择界面刷新即可。
- **画面全黑或不显示**：确认 `index.html` 与 `assets/` 在同一目录下，且没有把文件单独拖出文件夹；网页壁纸需要同目录的相对资源。
- **没有声音 / 音乐律动不动**：音乐律动依赖 Wallpaper Engine 的音频响应能力，需要在属性中开启“开启音乐律动”，并关闭“减少动态效果”。
- **属性面板是空的**：说明打开的不是本工程，或者 `project.json` 被其他版本的构建覆盖，重新解压一份新的发布包。
- **想彻底移除**：关闭壁纸后删除 `myprojects\RhineLabWallpaper` 文件夹即可，不需要卸载任何东西。
