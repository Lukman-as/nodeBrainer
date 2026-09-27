import test from "node:test";
import assert from "node:assert/strict";
import { AnswerCache } from "../src/lib/answer-cache";
import {
  fadeVisibility,
  flightProgress,
  FLIGHT_DURATION,
} from "../src/lib/graph-motion";
import { GeminiTransport } from "../src/lib/gemini-transport";

test("identical in-flight questions share a generation; changed context/account does not", async () => {
  const cache = new AnswerCache<string>();
  let calls = 0;
  let finish!: (value: string) => void;
  const generate = () => {
    calls++;
    return new Promise<string>((resolve) => {
      finish = resolve;
    });
  };
  const first = cache.get("owner-a:context-1", generate);
  const duplicate = cache.get("owner-a:context-1", generate);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish("answer");
  assert.deepEqual(await Promise.all([first, duplicate]), ["answer", "answer"]);
  assert.equal(
    await cache.get("owner-a:context-1", async () => "wrong"),
    "answer",
  );
  assert.equal(
    await cache.get("owner-b:context-1", async () => "other account"),
    "other account",
  );
  assert.equal(
    await cache.get("owner-a:context-2", async () => "updated evidence"),
    "updated evidence",
  );
});

test("answer cache expires, stays bounded and retries failed generations", async () => {
  let now = 0;
  const cache = new AnswerCache<string>(2, 100, () => now);
  await assert.rejects(
    cache.get("failed", async () => {
      throw new Error("quota");
    }),
    /quota/,
  );
  assert.equal(await cache.get("failed", async () => "recovered"), "recovered");
  await cache.get("second", async () => "second");
  await cache.get("third", async () => "third");
  assert.equal(await cache.get("failed", async () => "evicted"), "evicted");
  now = 101;
  assert.equal(await cache.get("failed", async () => "fresh"), "fresh");
});

test("a slow model falls back and subsequent answers start with the healthy model", async () => {
  const calls: string[] = [];
  const transport = new GeminiTransport(async (url) => {
    calls.push(String(url));
    if (String(url).includes("/slow:"))
      throw new DOMException("timed out", "TimeoutError");
    return Response.json({ answer: "ok" });
  });
  const ask = () =>
    transport.call("fixture", ["slow", "fast"], "generateContent", {}, 20000, {
      attemptTimeout: 8000,
      preferRecent: true,
    });
  await ask();
  await ask();
  assert.equal(calls.length, 3);
  assert.match(calls[0], /slow:/);
  assert.match(calls[1], /fast:/);
  assert.match(calls[2], /fast:/);
});

test("flight moves through intermediate frames and fades are reversible and frame-rate independent", () => {
  assert.equal(flightProgress(0), 0);
  assert.equal(flightProgress(FLIGHT_DURATION / 2), 0.5);
  assert.equal(flightProgress(FLIGHT_DURATION), 1);
  const frames = Array.from({ length: 67 }, (_, i) =>
    flightProgress((i * FLIGHT_DURATION) / 66),
  );
  assert.ok(frames.every((value, i) => !i || value >= frames[i - 1]));
  assert.ok(frames.slice(1, -1).every((value) => value > 0 && value < 1));
  const atRate = (rate: number) => {
    let opacity = 1;
    for (let i = 0; i < rate / 2; i++)
      opacity = fadeVisibility(opacity, 0, 1 / rate);
    return opacity;
  };
  assert.ok(Math.abs(atRate(30) - atRate(120)) < 1e-10);
  const mid = atRate(60);
  assert.ok(mid > 0 && mid < 1);
  const reversed = fadeVisibility(mid, 1, 1 / 60);
  assert.ok(reversed > mid && reversed < 1);
});
