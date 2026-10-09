import { tr, bindStaticTranslations } from "./i18n";
import { errorMessage, StartupResourceError } from "./startup-resources";

export type StartupPhase = "host" | "graphics" | "resources" | "interface";

export function showStartupError(root: HTMLElement, error: unknown, phase: StartupPhase, wallpaper: boolean) {
  let code = "STARTUP";
  let message = "启动未能完成。请重试，并在反馈问题时附上下面的错误信息。";
  if (error instanceof StartupResourceError) {
    code = error.code;
    message = error.code === "MODEL_RESOURCE"
      ? wallpaper
        ? "三维模型文件读取或解析失败。请检查壁纸文件是否完整，尝试重新下载壁纸。"
        : "三维模型文件加载或解析失败。请检查网络连接后重试。"
      : "档案标志图像解码失败。请重试，并在反馈问题时附上下面的错误信息。";
  } else if (phase === "graphics") {
    const webgl = /webgl/i.test(errorMessage(error));
    code = webgl ? "WEBGL_INIT" : "THREE_INIT";
    message = webgl
      ? wallpaper
        ? "无法初始化 WebGL 三维渲染。请重启 Wallpaper Engine；若仍失败，请检查显卡驱动，并附上下面的错误信息。"
        : "无法初始化 WebGL 三维渲染。请检查浏览器硬件加速与显卡驱动，然后重试。"
      : "三维场景初始化失败。请重试，并在反馈问题时附上下面的错误信息。";
  } else if (phase === "resources") {
    code = "THREE_SCENE";
    message = "三维场景准备失败。请重试，并在反馈问题时附上下面的错误信息。";
  }
  const panel = document.createElement("div");
  panel.className = "error-state";
  panel.setAttribute("role", "alert");
  const title = document.createElement("strong");
  title.textContent = "启动失败";
  const explanation = document.createElement("p");
  explanation.textContent = message;
  const detail = document.createElement("pre");
  detail.className = "startup-error-detail";
  // Browser errors may contain URLs or filenames. Never interpret them as HTML.
  detail.textContent = `[${code}]\n${error instanceof StartupResourceError ? `${error.resource}\n` : ""}${errorMessage(error).slice(0, 2000)}`;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "重新加载 →";
  retry.addEventListener("click", () => location.reload());
  panel.append(title, explanation, detail, retry);
  root.replaceChildren(panel);
  root.dataset.entry = "error";
  root.dataset.startupError = code;
  root.setAttribute("aria-label", tr("启动失败"));
  bindStaticTranslations(panel, ".startup-error-detail");
  retry.focus({ preventScroll: true });
}
