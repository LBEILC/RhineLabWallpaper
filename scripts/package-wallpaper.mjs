// Package release/wallpaper into a zip that can be extracted straight into
// `steamapps\common\wallpaper_engine\projects\myprojects\`.
//
//   node scripts/package-wallpaper.mjs --tag latest
//
// Outputs (inside release/):
//   RhineLabWallpaper-<tag>.zip          ready-to-extract project folder
//   RhineLabWallpaper-<tag>.zip.sha256   checksum for that archive
//   release-notes.md                     release body used by GitHub Actions
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { createZip } from "./zip-utils.mjs";

const BUILD_DIR = resolve("release/wallpaper");
const OUT_DIR = resolve("release");
const FOLDER_NAME = "RhineLabWallpaper";
const DOCS_URL =
  "https://github.com/LBEILC/RhineLabWallpaper/blob/main/docs/GITHUB-RELEASE.md";

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

function shortCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function latestChangelogSection(changelog, limit = 10) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    /^\d{4}\.\d{2}\.\d{2}$/.test(line.trim()),
  );
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) =>
    /^\d{4}\.\d{2}\.\d{2}$/.test(line.trim()),
  );
  return rest
    .slice(0, end < 0 ? rest.length : end)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);
}

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

const tag = argument("tag", process.env.RELEASE_TAG || "dev");
if (!/^[A-Za-z0-9._-]+$/.test(tag))
  throw new Error(`Release tag must be a plain file-name-safe string: ${tag}`);
const archiveName = `RhineLabWallpaper-${tag}.zip`;

const project = JSON.parse(await readFile("wallpaper/project.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

let buildFiles;
try {
  buildFiles = JSON.parse(
    await readFile(resolve(BUILD_DIR, "build-files.json"), "utf8"),
  );
} catch {
  throw new Error(
    `${BUILD_DIR} is missing build-files.json - run "npm run build:wallpaper" first`,
  );
}

const built = await walk(BUILD_DIR);
const builtRelative = built
  .map((path) => relative(BUILD_DIR, path).replaceAll("\\", "/"))
  .sort();
// build-files.json is written after the manifest is taken, so it never lists itself.
const recorded = buildFiles.map((file) => file.path).sort();
const described = builtRelative.filter((name) => name !== "build-files.json");
if (described.join("\n") !== recorded.join("\n"))
  throw new Error(
    "release/wallpaper does not match build-files.json - rebuild before packaging",
  );

// Individually licensed fonts must never leave the local checkout.
const licensed = builtRelative.filter((name) =>
  /(^|\/)novecento(\/|$)/i.test(name),
);
if (licensed.length)
  throw new Error(
    `Refusing to package individually licensed fonts: ${licensed.slice(0, 3).join(", ")}`,
  );

const indexHtml = await readFile(resolve(BUILD_DIR, "index.html"), "utf8");
if (/\b(?:src|href)=["']\//.test(indexHtml))
  throw new Error(
    "index.html contains root-relative URLs and cannot run from myprojects",
  );

const installText = [
  "Rhine Lab · 莱茵生命交互桌面 - Wallpaper Engine 本地加载说明",
  "",
  "1. 把 RhineLabWallpaper 文件夹整个复制到 Wallpaper Engine 的本地工程目录：",
  "   ...\\steamapps\\common\\wallpaper_engine\\projects\\myprojects\\",
  "   （Steam 库中右键 Wallpaper Engine → 管理 → 浏览本地文件，即可找到 wallpaper_engine 目录）",
  "2. 打开 Wallpaper Engine，进入「已安装」，搜索 Rhine Lab，选择「莱茵生命交互桌面」。",
  "3. 点击应用，即可作为桌面壁纸；在右侧属性面板中调整模式、事项、声音与画面参数。",
  "",
  "也可以在 Wallpaper Engine 编辑器中把 index.html 拖到「创建壁纸 / Create Wallpaper」按钮完成导入。",
  "更新时下载新的压缩包，覆盖 myprojects\\RhineLabWallpaper 中的文件；",
  "如果曾在属性面板中改过设置，先备份工程内的 project.json。",
  "",
  `详细说明：${DOCS_URL}`,
  "",
  "壁纸资源全部本地运行，不需要联网。角色、名称与相关世界观归原权利方所有，本作品与官方无关联。",
  "",
].join("\r\n");

// Directory entries are optional in ZIP; extractors recreate folders from file paths.
const zipEntries = [];
for (const name of builtRelative)
  zipEntries.push({
    name: `${FOLDER_NAME}/${name}`,
    data: await readFile(resolve(BUILD_DIR, name)),
  });
// UTF-8 BOM so Windows editors and PowerShell 5.1 detect the Chinese text correctly.
zipEntries.push({
  name: "INSTALL.txt",
  data: Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(installText, "utf8"),
  ]),
});

const archive = createZip(zipEntries);
const digest = createHash("sha256").update(archive).digest("hex");
await writeFile(resolve(OUT_DIR, archiveName), archive);
await writeFile(
  resolve(OUT_DIR, `${archiveName}.sha256`),
  `${digest}  ${archiveName}\n`,
);

const projectBytes = zipEntries
  .filter((entry) => entry.name.startsWith(`${FOLDER_NAME}/`))
  .reduce((total, entry) => total + entry.data.length, 0);
const commit = shortCommit();
const bullets = latestChangelogSection(
  await readFile("docs/CHANGELOG.md", "utf8"),
);
const notes = [
  `# ${project.title}`,
  "",
  "Wallpaper Engine 网页壁纸的 GitHub 构建包，功能与创意工坊版一致，解压后放入 `projects\\myprojects\\` 即可在本地加载。",
  "",
  `- 发布标识：\`${tag}\``,
  `- 源码提交：\`${commit}\``,
  `- 工程版本：${packageJson.version}`,
  `- 内容：${builtRelative.length} 个文件，${(projectBytes / 1048576).toFixed(1)} MiB；压缩包 ${(archive.length / 1048576).toFixed(1)} MiB`,
  `- 校验：\`${archiveName}.sha256\``,
  "",
  "## 安装",
  "",
  `1. 下载并解压 **${archiveName}**，得到 \`${FOLDER_NAME}\` 文件夹。`,
  "2. Steam 库中右键 Wallpaper Engine → 管理 → 浏览本地文件，进入 `projects\\myprojects\\`。",
  `3. 把 \`${FOLDER_NAME}\` 整个文件夹复制进去。`,
  "4. 打开 Wallpaper Engine → 已安装 → 搜索 `Rhine Lab` → 选择 **Rhine Lab · 莱茵生命交互桌面**，应用即可。",
  "5. 属性面板与创意工坊版相同；更新时用新压缩包覆盖该文件夹，若改过属性请先备份 `project.json`。",
  "",
  `完整说明：[docs/GITHUB-RELEASE.md](${DOCS_URL})`,
  "",
  ...(bullets.length
    ? [
        "## 本次更新",
        "",
        ...bullets.map((line) =>
          line.startsWith("•") ? `- ${line.slice(1).trim()}` : line,
        ),
        "",
      ]
    : []),
  "## 说明",
  "",
  "- 工程内的字体许可、第三方许可与 `LICENSE` 随包保留；仅供本机使用的 MyFonts 授权字体不随任何构建包分发。",
  "- 包内不含源码、Blender 工程与开发工具；需要源码请使用仓库的 Code → Download ZIP。",
  "- 非官方同人作品，与《明日方舟》及莱茵生命相关权利方无隶属关系。",
  "",
].join("\n");
await writeFile(resolve(OUT_DIR, "release-notes.md"), notes);

console.log(
  `Packaged ${archiveName}: ${builtRelative.length} files, project ${(projectBytes / 1048576).toFixed(1)} MiB, archive ${(archive.length / 1048576).toFixed(1)} MiB`,
);
console.log(`sha256 ${digest}`);
