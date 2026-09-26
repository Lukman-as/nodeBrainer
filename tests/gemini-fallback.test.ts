import test from "node:test";
import assert from "node:assert/strict";
import { GeminiTransport, parseModels } from "../src/lib/gemini-transport";
import { ApiError } from "../src/lib/api-error";
const ok = () => Response.json({ answer: "synthetic" });

test("model list trims whitespace and removes duplicates", () => {
  assert.deepEqual(parseModels(" a, ,b,a "), ["a", "b"]);
});
test("quota fallback preserves the payload, skips cooldown, and retries after expiry", async () => {
  let now = 0;
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const transport = new GeminiTransport(
    async (url, init) => {
      calls.push(String(url));
      bodies.push(init?.body);
      return String(url).includes("/first:")
        ? Response.json({}, { status: 429, headers: { "retry-after": "120" } })
        : ok();
    },
    () => now,
  );
  const run = () =>
    transport.call(
      "test",
      ["first", "second"],
      "generateContent",
      { media: "fixture" },
      40000,
    );
  await run();
  await run();
  assert.equal(calls.filter((url) => url.includes("/first:")).length, 1);
  assert.equal(calls.filter((url) => url.includes("/second:")).length, 2);
  assert.ok(
    bodies.every((body) => body === JSON.stringify({ media: "fixture" })),
  );
  now = 120001;
  await run();
  assert.equal(calls.filter((url) => url.includes("/first:")).length, 2);
});
test("unavailable models fall back but invalid credentials do not", async () => {
  for (const status of [404, 503, 401, 403, 400]) {
    let count = 0;
    const transport = new GeminiTransport(async () =>
      ++count === 1 ? Response.json({}, { status }) : ok(),
    );
    const run = transport.call(
      "test",
      ["first", "second"],
      "generateContent",
      {},
      10000,
    );
    if ([404, 503].includes(status)) {
      await run;
      assert.equal(count, 2);
    } else {
      await assert.rejects(run);
      assert.equal(count, 1);
    }
  }
});
test("all models exhausted reports quota, and cooldown respects provider RetryInfo", async () => {
  let count = 0,
    now = 0;
  const transport = new GeminiTransport(
    async () => {
      count++;
      return Response.json(
        {
          error: {
            details: [
              {
                "@type": "type.googleapis.com/google.rpc.RetryInfo",
                retryDelay: "180s",
              },
            ],
          },
        },
        { status: 429 },
      );
    },
    () => now,
  );
  const run = () =>
    transport.call("test", ["a", "b"], "generateContent", {}, 10000);
  await assert.rejects(
    run(),
    (e) =>
      e instanceof ApiError &&
      e.status === 429 &&
      /2 configured/.test(e.message),
  );
  now = 90000;
  await assert.rejects(run());
  assert.equal(count, 2);
  now = 180001;
  await assert.rejects(run());
  assert.equal(count, 4);
});
test("embedding requests retain their own model and cooldown scope", async () => {
  const urls: string[] = [];
  const transport = new GeminiTransport(async (url) => {
    urls.push(String(url));
    return ok();
  });
  await transport.call("test", ["embedding-model"], "embedContent", {}, 10000);
  assert.match(urls[0], /embedding-model:embedContent$/);
});
