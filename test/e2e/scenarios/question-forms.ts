import assert from "node:assert/strict"
import type { Fixture } from "../support/fixture"

export function questionForms(mapping?: string) {
    return async ({ terminal, request, sessionID }: Fixture) => {
        const { keys, type, screen } = terminal
        const endpoint = `/api/session/${sessionID}/form`
        async function normal() {
            if (mapping) await type(mapping)
            else await keys("Escape")
        }
        function row(ansi: string, label: string) {
            return ansi.split("\n").find((line) => line.includes(label))
        }

        await type("original draft")
        for (const multiple of [false, true]) {
            const label = multiple ? "multiple" : "single"
            if (multiple) await type("i")
            else await keys("Escape")
            const promptMode = multiple ? "INSERT" : "NORMAL"
            await screen(`${label}-prompt`, (text) => text.includes("original draft") && text.includes(promptMode))
            const form = (await request(endpoint, {
                title: `Vim question ${label}`,
                metadata: { kind: "question" },
                fields: [{
                    key: "answer", title: "Choice", description: "Choose an option or type a response",
                    type: multiple ? "multiselect" : "string",
                    options: [{ value: "alpha", label: "Alpha" }, { value: "beta", label: "Beta" }],
                    custom: true,
                }],
            })).data
            let firstSelected: string | undefined
            let secondUnselected: string | undefined
            let customUnselected: string | undefined
            await screen(`${label}-opened`, (text, ansi) => {
                if (!text.includes("Type your own answer") || !text.includes("NORMAL")) return false
                firstSelected = row(ansi, "Alpha")
                secondUnselected = row(ansi, "Beta")
                customUnselected = row(ansi, "Type your own answer")
                return true
            })
            await type("j")
            let secondSelected: string | undefined
            await screen(`${label}-next`, (text, ansi) => {
                secondSelected = row(ansi, "Beta")
                return text.includes("NORMAL") && secondSelected !== secondUnselected
            })
            await type("j")
            await screen(`${label}-custom`, (text, ansi) => text.includes("NORMAL")
                && row(ansi, "Type your own answer") !== customUnselected)
            await type("k")
            await screen(`${label}-leave-custom`, (text, ansi) => text.includes("Type your own answer")
                && text.includes("NORMAL") && row(ansi, "Beta") === secondSelected)
            await type("j")
            await screen(`${label}-custom-again`, (text, ansi) => text.includes("NORMAL")
                && row(ansi, "Type your own answer") !== customUnselected)

            // Open and leave insert mode in a single burst, before the host's
            // editor-focus microtask runs. Custom mappings must work here too.
            if (mapping) await type(`i${mapping}`)
            else await keys("i", "Escape")
            await screen(`${label}-burst-normal`, (text) => text.includes("NORMAL")
                && text.includes("Type your own answer") && text.includes("esc dismiss"))
            await type("iresponse")
            await screen(`${label}-typing`, (text) => text.includes("INSERT") && /3\..*response/.test(text))
            await normal()
            await screen(`${label}-mapped-normal`, (text) => text.includes("NORMAL")
                && /3\..*response/.test(text) && text.includes("esc dismiss"))
            await type("k")
            await screen(`${label}-leave-answer`, (text, ansi) => text.includes("NORMAL")
                && row(ansi, "Beta") === secondSelected && /3\..*response/.test(text))
            await type("j")
            if (multiple) await type("i")
            else await keys("Enter")
            await screen(`${label}-enter-edits`, (text) => text.includes("INSERT") && text.includes("esc close"))
            let answer = "response"
            if (!mapping) {
                await type("kj")
                answer += "kj"
                await screen(`${label}-unmapped-kj-is-text`, (text) => text.includes("INSERT") && text.includes(answer))
            } else {
                await type(mapping[0])
                answer += mapping[0]
                await screen(`${label}-mapping-timeout`, (text) => text.includes("INSERT") && text.includes(answer))
                await type(mapping[0] + "x")
                answer += mapping[0] + "x"
                await screen(`${label}-mapping-mismatch`, (text) => text.includes("INSERT") && text.includes(answer))
            }
            await keys("Escape")
            await screen(`${label}-escape-normal`, (text) => text.includes("NORMAL")
                && text.includes(answer) && text.includes("esc dismiss"))
            // Navigation remains usable after leaving a nonempty answer.
            await type("kk")
            await screen(`${label}-back-to-first`, (text, ansi) => text.includes("NORMAL")
                && row(ansi, "Alpha") === firstSelected && text.includes(answer))
            await type("jj")
            if (multiple) await type("i")
            else await keys("Enter")
            await screen(`${label}-ready-to-submit`, (text) => text.includes("INSERT") && text.includes(answer))
            await keys(mapping ? "C-s" : "Enter")
            if (multiple) {
                await screen(`${label}-committed`, (text) => text.includes("NORMAL") && text.includes("enter toggle"))
                await keys("Tab")
                await screen(`${label}-review`, (text) => text.includes(`Choice: ${answer}`) && text.includes("NORMAL"))
                await keys("Enter")
            }
            await screen(`${label}-restored`, (text) => !text.includes(`Vim question ${label}`)
                && text.includes("original draft") && text.includes(promptMode))
            const detail = (await request(`${endpoint}/${form.id}`)).data
            assert.deepEqual(detail.state, { status: "answered", answer: { answer: multiple ? [answer] : answer } })
        }
        if (mapping) return

        const fields = (await request(endpoint, {
            title: "Several questions",
            metadata: { kind: "question" },
            fields: [
                { key: "targets", title: "Targets", type: "multiselect", custom: true,
                    options: [{ value: "alpha", label: "Alpha" }, { value: "beta", label: "Beta" }] },
                { key: "other", title: "Other", type: "string", custom: true,
                    options: [{ value: "one", label: "One" }, { value: "two", label: "Two" }] },
            ],
        })).data
        await screen("fields-open", (text) => text.includes("Several questions") && text.includes("Alpha") && text.includes("NORMAL"))
        await type("jj1")
        await screen("fields-number-from-custom", (text) => text.includes("[✓] Alpha") && text.includes("Type your own answer") && text.includes("NORMAL"))
        await keys("Space")
        await screen("fields-space-toggle", (text) => text.includes("[ ] Alpha") && text.includes("NORMAL"))
        await keys("Enter")
        await screen("fields-enter-toggle", (text) => text.includes("[✓] Alpha") && text.includes("NORMAL"))
        await type("iextra")
        await screen("fields-i-opens-custom", (text) => text.includes("[✓] extra") && text.includes("INSERT"))
        await keys("Escape")
        await type("l")
        await screen("fields-next", (text) => text.includes("One") && !text.includes("Alpha") && text.includes("NORMAL"))
        await type("1")
        await screen("fields-review", (text) => text.includes("Targets:") && text.includes("extra") && text.includes("Other:") && text.includes("NORMAL"))
        await type("hh")
        await screen("fields-draft-restored", (text) => text.includes("[✓] Alpha") && text.includes("[✓] extra") && text.includes("NORMAL"))
        await keys("Tab", "Tab", "Enter")
        await screen("fields-submitted", (text) => !text.includes("Several questions") && text.includes("original draft") && text.includes("INSERT"))
        assert.deepEqual((await request(`${endpoint}/${fields.id}`)).data.state, {
            status: "answered", answer: { targets: ["alpha", "extra"], other: "one" },
        })

        const cancel = (await request(endpoint, {
            title: "Cancel question", fields: [{ key: "answer", type: "string", custom: true,
                options: [{ value: "one", label: "One" }] }],
        })).data
        await screen("cancel-open", (text) => text.includes("Cancel question") && text.includes("NORMAL"))
        await type("idraft")
        await screen("cancel-editing", (text) => /2\..*draft/.test(text) && text.includes("INSERT"))
        await keys("Escape")
        await screen("cancel-normal", (text) => /2\..*draft/.test(text) && text.includes("NORMAL"))
        await keys("Escape")
        await screen("cancel-restored", (text) => !text.includes("Cancel question") && text.includes("original draft") && text.includes("INSERT"))
        assert.equal((await request(`${endpoint}/${cancel.id}`)).data.state.status, "cancelled")

        // Forms also have text-only fields, where native Escape dismisses the
        // whole form. Leaving insert mode must consume that first Escape.
        const textual = (await request(endpoint, {
            title: "Text-only form", fields: [{ key: "answer", type: "string", default: "seed" }],
        })).data
        await screen("textual-open", (text) => text.includes("Text-only form") && text.includes("INSERT"))
        await type(" more")
        await keys("Escape")
        await screen("textual-normal", (text) => text.includes("Text-only form") && text.includes("seed more") && text.includes("NORMAL"))
        await keys("Enter")
        await screen("textual-review", (text) => text.includes("answer: seed more") && text.includes("NORMAL"))
        await keys("Enter")
        await screen("textual-submitted", (text) => !text.includes("Text-only form") && text.includes("original draft") && text.includes("INSERT"))
        assert.deepEqual((await request(`${endpoint}/${textual.id}`)).data.state, {
            status: "answered", answer: { answer: "seed more" },
        })
    }
}
