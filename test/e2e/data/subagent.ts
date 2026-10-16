import type { Message } from "../support/fixture"

export const subagentMessages: Message[] = [
  { id: "msg_subagent_prompt", type: "user", text: "Check subagent tool access", time: { created: 1 } },
  {
    id: "msg_subagent_foreground",
    type: "assistant",
    agent: "build",
    model: { providerID: "test", id: "fixture" },
    time: { created: 2, completed: 3 },
    finish: "stop",
    content: [
      {
        type: "tool",
        id: "foreground",
        name: "subagent",
        time: { created: 2, completed: 3 },
        state: {
          status: "completed",
          input: {
            agent: "general",
            description: "Check question tool access",
            prompt: "Do you have a question tool?",
          },
          metadata: { sessionID: "ses_foreground", status: "completed" },
          content: [
            {
              type: "text",
              text: '<subagent sessionID="ses_foreground" state="completed">\nNo. There is no question tool in my available tool list.\n\nAvailable tools: read, grep, shell.\n</subagent>',
            },
          ],
        },
      },
      { type: "text", text: "Parent summary of the foreground result" },
    ],
  },
  {
    id: "msg_subagent_background",
    type: "assistant",
    agent: "build",
    model: { providerID: "test", id: "fixture" },
    time: { created: 4, completed: 5 },
    finish: "stop",
    content: [
      {
        type: "tool",
        id: "background",
        name: "subagent",
        time: { created: 4, completed: 5 },
        state: {
          status: "completed",
          input: {
            agent: "general",
            description: "Check background tool access",
            prompt: "List your tools",
            background: true,
          },
          metadata: { sessionID: "ses_background", status: "running" },
          content: [{ type: "text", text: "The subagent is working in the background" }],
        },
      },
      { type: "text", text: "Background task launched" },
    ],
  },
  {
    id: "msg_subagent_hidden",
    type: "synthetic",
    text: "Hidden fixture context",
    time: { created: 6 },
    metadata: { source: "fixture" },
  },
  {
    id: "msg_subagent_completion",
    type: "synthetic",
    description: "Check background tool access",
    time: { created: 7 },
    metadata: { source: "subagent", childID: "ses_background", agent: "general", state: "completed" },
    text: '<subagent sessionID="ses_background" state="completed" description="Check background tool access">\nBackground response: read, grep, shell.\n</subagent>',
  },
]
