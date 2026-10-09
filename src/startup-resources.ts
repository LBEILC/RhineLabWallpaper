export class StartupResourceError extends Error {
  constructor(
    readonly code: "MODEL_RESOURCE" | "LABEL_RESOURCE",
    readonly resource: string,
    cause: unknown,
  ) {
    super(errorMessage(cause), { cause });
    this.name = "StartupResourceError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Fonts improve the opening, but must never prevent access to the terminal. */
export async function prepareStartupFonts(load: () => Promise<unknown>, timeoutMs = 8000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      load(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Font preparation timed out")), timeoutMs);
      }),
    ]);
  } catch (error) {
    // font-display: swap and the existing system font stack provide the fallback.
    // A font that finishes later can still replace the fallback normally.
    console.warn("[STARTUP_FONT_FALLBACK] Continuing with available fonts.", error);
  } finally {
    clearTimeout(timer);
  }
}
