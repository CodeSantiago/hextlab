export const TIMEOUTS = {
  health: 5_000,
  metadata: 15_000,
  models: 30_000,
  message: 90_000,
} as const;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = TIMEOUTS.metadata,
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  let timedOut = false;

  if (externalSignal?.aborted) {
    controller.abort();
  }

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error(`La solicitud superó el timeout de ${timeoutMs} ms.`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}
