import type { Message } from "../fixture"

const files = [
    { file: "first.ts", status: "modified", additions: 2, deletions: 2,
        patch: "--- first.ts\n+++ first.ts\n@@ -1,1 +1,1 @@\n-old first\n+new first\n@@ -20,1 +20,1 @@\n-old last\n+new last\n" },
    { file: "added.ts", status: "added", additions: 1, deletions: 0,
        patch: "--- /dev/null\n+++ added.ts\n@@ -0,0 +1,1 @@\n+added content\n" },
    { file: "deleted.ts", status: "deleted", additions: 0, deletions: 1,
        patch: "--- deleted.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-deleted content\n" },
]

const edits: Extract<Message, { type: "assistant" }>["content"] = []
for (const [index, file] of ["edited-one.ts", "edited-two.ts"].entries()) {
    edits.push({
        type: "tool", id: `edit-${index}`, name: "edit", time: { created: 2, completed: 3 }, state: {
            status: "completed", input: { path: file, oldString: "before", newString: "after" },
            content: [{ type: "text", text: `Edited ${file} (1 replacement)` }], metadata: { files: [
                { file, status: "modified", additions: 1, deletions: 1, patch: `--- ${file}\n+++ ${file}\n@@ -1,1 +1,1 @@\n-before\n+after\n` },
            ] },
        },
    })
}

export const fileChangeMessages: Message[] = [
    { id: "msg_changes_1", type: "user", text: "Update the fixture files", time: { created: 1 } },
    { id: "msg_changes_2", type: "assistant", agent: "build", model: { providerID: "test", id: "fixture" }, time: { created: 2, completed: 3 }, content: [
        { type: "tool", id: "patch-files", name: "patch", time: { created: 2, completed: 3 }, state: {
            status: "completed", input: { patchText: "*** Begin Patch\n*** Update File: first.ts\n@@\n-old first\n+new first\n*** Add File: added.ts\n+added content\n*** Delete File: deleted.ts\n*** End Patch" },
            content: [{ type: "text", text: "Success. Updated the following files:\nM first.ts\nA added.ts\nD deleted.ts" }], metadata: { files },
        } },
        ...edits,
        { type: "text", text: "Change fixtures ready" },
    ] },
]
