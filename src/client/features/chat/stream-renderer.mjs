function parseSseBlock(block = "") {
  const lines = String(block || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  let event = "message";
  const dataLines = [];
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim() || "message";
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  const rawData = dataLines.join("\n");
  let data = rawData;
  if (rawData) {
    try {
      data = JSON.parse(rawData);
    } catch {
      data = rawData;
    }
  }
  return { event, data };
}

function supportsReadableResponse(response) {
  return Boolean(response?.body && typeof response.body.getReader === "function");
}

export function supportsStreamingAssist() {
  return typeof fetch === "function" && typeof TextDecoder !== "undefined";
}

export async function requestAssistStream({
  payload = {},
  url = "/api/chat-assist-stream",
  fetchImpl = fetch,
  timeoutMs = 12000,
  retries = 1,
  onStart = null,
  onToken = null,
  onEnd = null,
  onError = null
} = {}) {
  let attempt = 0;
  while (attempt <= retries) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let idleTimer = null;
    try {
      const resetIdleTimer = () => {
        if (!controller) return;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          try {
            controller.abort();
          } catch {
            // ignore
          }
        }, Math.max(1, Number(timeoutMs || 12000)));
      };

      resetIdleTimer();
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller?.signal
      });
      if (!response.ok || !supportsReadableResponse(response)) {
        throw new Error(`stream_http_${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      onStart?.({ attempt: attempt + 1 });
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdleTimer();
        buffer += decoder.decode(value, { stream: true });
        let sep = buffer.indexOf("\n\n");
        while (sep !== -1) {
          const rawBlock = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const { event, data } = parseSseBlock(rawBlock);
          if (event === "start") {
            onStart?.(data || {});
          } else if (event === "token") {
            const token = typeof data === "string" ? data : String(data?.token || "");
            if (token) {
              fullText += token;
              onToken?.(token, fullText, data || {});
            }
          } else if (event === "end") {
            const endText = typeof data?.text === "string" ? data.text : fullText;
            onEnd?.(endText, data || {});
            if (idleTimer) clearTimeout(idleTimer);
            return { ok: true, text: endText, mode: data?.mode || "stream" };
          } else if (event === "error") {
            throw new Error(String(data?.error || data || "stream_error"));
          }
          sep = buffer.indexOf("\n\n");
        }
      }

      const finalText = fullText.trim();
      if (!finalText) {
        throw new Error("stream_empty");
      }
      onEnd?.(finalText, { mode: "stream_incomplete_end" });
      if (idleTimer) clearTimeout(idleTimer);
      return { ok: true, text: finalText, mode: "stream_incomplete_end" };
    } catch (error) {
      if (idleTimer) clearTimeout(idleTimer);
      if (attempt >= retries) {
        onError?.(error);
        return { ok: false, error: String(error?.message || "stream_failed") };
      }
      attempt += 1;
    }
  }
  return { ok: false, error: "stream_failed" };
}
