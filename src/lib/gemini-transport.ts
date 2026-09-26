import { ApiError } from "./api-error";

export function parseModels(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
}

/** Process-local cooldowns. Other server instances keep their own state. */
export class GeminiTransport {
  private cooldowns = new Map<string, { until: number; status: number }>();
  constructor(
    private request: typeof fetch = fetch,
    private now = Date.now,
  ) {}

  async call(
    apiKey: string,
    models: string[],
    action: string,
    body: unknown,
    timeout: number,
  ) {
    const names = parseModels(models.join(","));
    if (!names.length)
      throw new ApiError(503, "Configure at least one Gemini model.");
    const deadline = this.now() + timeout;
    const payload = JSON.stringify(body);
    const statuses: number[] = [];
    for (const name of names) {
      const key = `${apiKey}:${action}:${name}`;
      const cooldown = this.cooldowns.get(key);
      if (cooldown && cooldown.until > this.now()) {
        statuses.push(cooldown.status);
        continue;
      }
      this.cooldowns.delete(key);
      const remaining = deadline - this.now();
      if (remaining <= 0)
        throw new ApiError(
          504,
          "Gemini took too long. Try a smaller file or retry shortly.",
        );
      let response: Response;
      try {
        response = await this.request(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:${action}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: payload,
            signal: AbortSignal.timeout(remaining),
          },
        );
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError")
          throw new ApiError(
            504,
            "Gemini took too long. Try a smaller file or retry shortly.",
          );
        throw error;
      }
      if (response.ok) return response.json();
      if (![429, 404, 503].includes(response.status)) {
        // Bad requests and authentication failures aren't fixed by model rotation.
        await response.body?.cancel();
        throw new ApiError(
          502,
          "Gemini rejected the request. Check your API key and the input format.",
        );
      }
      statuses.push(response.status);
      let delay = response.status === 404 ? 300000 : 60000;
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) {
        const seconds = Number(retryAfter);
        const ms = Number.isFinite(seconds)
          ? seconds * 1000
          : Date.parse(retryAfter) - this.now();
        if (Number.isFinite(ms) && ms > 0) delay = Math.max(delay, ms);
      }
      // Google may put the retry interval in google.rpc.RetryInfo instead of a header.
      const errorBody = await response.json().catch(() => null);
      const details = errorBody?.error?.details;
      if (Array.isArray(details)) {
        for (const detail of details) {
          if (
            detail?.["@type"] === "type.googleapis.com/google.rpc.RetryInfo" &&
            typeof detail.retryDelay === "string" &&
            /^\d+(\.\d+)?s$/.test(detail.retryDelay)
          )
            delay = Math.max(delay, parseFloat(detail.retryDelay) * 1000);
        }
      }
      this.cooldowns.set(key, {
        until: this.now() + delay,
        status: response.status,
      });
      console.warn(
        `Gemini ${name} returned ${response.status}; checking the next configured model.`,
      );
    }
    if (statuses.includes(429))
      throw new ApiError(
        429,
        `No configured Gemini model is ready: quota limits were reached and fallbacks are exhausted or cooling down (${names.length} configured). Retry later or check project limits in AI Studio.`,
      );
    throw new ApiError(
      503,
      "All configured Gemini models are unavailable or cooling down. Retry later or update the model list.",
    );
  }
}
