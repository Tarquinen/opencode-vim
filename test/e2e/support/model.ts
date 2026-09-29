import assert from "node:assert/strict"

// Only the model response is controlled; OpenCode owns message creation,
// streaming events, transcript rendering and reader focus.
export function createStreamingModel(initial: string) {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  const encoder = new TextEncoder()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      assert.equal(new URL(request.url).pathname, "/v1/chat/completions")
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          controller = stream
          write(initial)
        },
      })
      return new Response(body, { headers: { "content-type": "text/event-stream" } })
    },
  })

  function write(text: string, finish = false) {
    assert(controller, "OpenCode has not requested the model response")
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({
          id: "completion-fixture",
          object: "chat.completion.chunk",
          created: 1,
          model: "stream",
          choices: [{ index: 0, delta: { content: text }, finish_reason: finish ? "stop" : null }],
        })}\n\n`,
      ),
    )
    if (finish) {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      controller.close()
    }
  }

  return {
    config: {
      model: "fixture/stream",
      providers: {
        fixture: {
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: `${server.url.origin}/v1`, apiKey: "fixture" },
          models: { stream: { limit: { context: 128_000, output: 4096 } } },
        },
      },
    },
    write,
    stop() {
      server.stop(true)
    },
  }
}
