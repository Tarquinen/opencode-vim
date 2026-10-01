import assert from "node:assert/strict"

export function createDelayedClipboard() {
  const requested = Promise.withResolvers<void>()
  const response = Promise.withResolvers<Response>()
  const delivered = Promise.withResolvers<void>()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname === "/delivered") {
        delivered.resolve()
        return new Response("ok")
      }
      requested.resolve()
      return response.promise
    },
  })
  return {
    url: server.url.origin,
    async waitForRead() {
      await Promise.race([requested.promise, Bun.sleep(5_000).then(() => assert.fail("No desktop clipboard read"))])
    },
    async release() {
      response.resolve(new Response("STALE CLIPBOARD"))
      await Promise.race([
        delivered.promise,
        Bun.sleep(5_000).then(() => assert.fail("Clipboard response was not delivered")),
      ])
    },
    stop() {
      server.stop(true)
    },
  }
}
