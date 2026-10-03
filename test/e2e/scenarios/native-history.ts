import assert from "node:assert/strict"
import type { Fixture } from "../support/fixture"

export async function nativeHistory({ terminal, probe, request, sessionID, stream, workspace }: Fixture) {
  assert(stream)
  const pasted = "Native undo first line\nsecond original line\nthird original line\nfourth original line"
  const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
  await Bun.write(`${workspace}/native-history.txt`, "Native history file contents\n")
  await Bun.write(`${workspace}/native-history.png`, Buffer.from(image, "base64"))

  for (const [index, kind] of ["paste", "image", "file"].entries()) {
    if (index) await terminal.type("i")
    await terminal.screen(`${kind}-insert`, (text) => text.includes("INSERT"))
    if (kind === "file") {
      await terminal.type("@native-history.txt")
      await terminal.screen("file-autocomplete", (text) => text.includes("native-history.txt"))
      await terminal.keys("Enter")
    } else await terminal.paste(kind === "paste" ? pasted : `${workspace}/native-history.png`)
    const label = kind === "paste" ? "[Pasted ~4 lines]" : kind === "image" ? "[Image 1]" : "@native-history.txt"
    await terminal.screen(`${kind}-attached`, async () => (await probe()).editor?.text.includes(label))
    const original = (await probe()).editor.text
    await terminal.keys("Escape")
    await terminal.screen(`${kind}-normal`, (text) => text.includes("NORMAL"))
    await terminal.type("u")
    await terminal.screen(`${kind}-undone`, async () => (await probe()).editor?.text === "")
    await terminal.keys("C-r")
    await terminal.screen(`${kind}-redone`, async () => (await probe()).editor?.text === original)
    await terminal.keys("Enter")
    await terminal.screen(`${kind}-submitted`, (text) => text.split("native history response").length === index + 2)
    stream.write("", true)
    await terminal.screen(`${kind}-completed`, async () => {
      const exported = await request(`/api/experimental/session/${sessionID}/export`)
      const assistant = exported.data.messages.filter((message: any) => message.type === "assistant").at(-1)
      return !!assistant?.time.completed
    })
    const exported = await request(`/api/experimental/session/${sessionID}/export`)
    const user = exported.data.messages.filter((message: any) => message.type === "user").at(-1)
    if (kind === "paste") assert.equal(user.text.trim(), pasted, "Redo must restore the original pasted contents")
    else {
      assert.equal(user.files.length, 1, "Redo must restore the attachment, not just its label")
      if (kind === "image") assert.equal(user.files[0].data, image)
      else assert.equal(user.files[0].name, "native-history.txt")
    }
  }
}
