import test from "node:test";
import assert from "node:assert/strict";
import { requestAssistStream } from "../src/client/features/chat/stream-renderer.mjs";

function streamResponseFromChunks(chunks = []) {
  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(new TextEncoder().encode(chunk)));
      controller.close();
    }
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}

test("requestAssistStream reads ordered SSE events", async () => {
  const started = [];
  const tokens = [];
  const ended = [];
  const fetchImpl = async () =>
    streamResponseFromChunks([
      'event: start\ndata: {"traceId":"t1"}\n\n',
      'event: token\ndata: {"token":"Hello "}\n\n',
      'event: token\ndata: {"token":"world"}\n\n',
      'event: end\ndata: {"text":"Hello world","mode":"llm_stream"}\n\n'
    ]);

  const result = await requestAssistStream({
    payload: { task: "fluency" },
    fetchImpl,
    onStart: (meta) => started.push(meta),
    onToken: (token) => tokens.push(token),
    onEnd: (text, meta) => ended.push({ text, meta }),
    retries: 0
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, "Hello world");
  assert.equal(tokens.join(""), "Hello world");
  assert.equal(started.length >= 1, true);
  assert.equal(ended.length, 1);
  assert.equal(ended[0].meta.mode, "llm_stream");
});

test("requestAssistStream surfaces error event", async () => {
  const fetchImpl = async () =>
    streamResponseFromChunks([
      'event: start\ndata: {"traceId":"t1"}\n\n',
      'event: error\ndata: {"error":"output_blocked"}\n\n'
    ]);
  let onErrorCalled = false;
  const result = await requestAssistStream({
    payload: { task: "fluency" },
    fetchImpl,
    retries: 0,
    onError: () => {
      onErrorCalled = true;
    }
  });
  assert.equal(result.ok, false);
  assert.equal(onErrorCalled, true);
});

test("requestAssistStream retries once before failing", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("stream_down");
  };
  const result = await requestAssistStream({
    payload: { task: "fluency" },
    fetchImpl,
    retries: 1
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 2);
});
