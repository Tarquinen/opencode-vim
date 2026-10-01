import { createFixture } from "./helpers/fixture"
import { createPromptMap, hostFromVimOffset } from "../src/vim/map"

for (const pattern of ["word ", "word\n", "中e\u0301👩‍💻\t\n"]) {
  for (const length of [1000, 10000, 100000]) {
    const text = pattern.repeat(Math.floor(length / pattern.length))
    const fixture = await createFixture(text)
    try {
      const start = performance.now()
      const map = createPromptMap(text)
      const mapMs = performance.now() - start
      fixture.input.cursorOffset = hostFromVimOffset(map, Math.floor(map.vimText.length / 2))
      await fixture.keys("hl".repeat(5))
      const moveStart = performance.now()
      await fixture.keys("hl".repeat(50))
      const motionMsPerKey = (performance.now() - moveStart) / 100
      const editStart = performance.now()
      await fixture.keys("xu".repeat(10))
      const deleteUndoMsPerKey = (performance.now() - editStart) / 20
      if (fixture.input.plainText !== text) throw new Error("Delete/undo did not restore the buffer")
      console.log(JSON.stringify({ pattern, length: text.length, mapMs, motionMsPerKey, deleteUndoMsPerKey }))
    } finally {
      fixture.dispose()
    }
  }
}
