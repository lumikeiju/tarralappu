export async function readServerEvents(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lines: string[] = [];

  function handleLine(line: string): boolean {
    if (!line) {
      const data = lines.join("\n");
      lines = [];
      if (data === "[DONE]") return true;
      if (data) onData(data);
    } else if (line.startsWith("data:")) {
      lines.push(line.slice(5).replace(/^ /, ""));
    }
    return false;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let lineEnd: number;
      while ((lineEnd = buffer.indexOf("\n")) !== -1) {
        if (handleLine(buffer.slice(0, lineEnd).replace(/\r$/, ""))) {
          void reader.cancel().catch(() => {});
          return;
        }
        buffer = buffer.slice(lineEnd + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer) handleLine(buffer.replace(/\r$/, ""));
    handleLine("");
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
