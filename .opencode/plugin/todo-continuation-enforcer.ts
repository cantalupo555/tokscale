import { type Plugin } from "@opencode-ai/plugin"

interface Todo {
  content: string
  status: string
  priority: string
  id: string
}

const CONTINUATION_PROMPT = `[SYSTEM REMINDER - TODO ENFORCEMENT]

Your todo list is NOT complete. There are still incomplete tasks remaining.

CRITICAL INSTRUCTION:
- You MUST NOT stop working until ALL todos are marked as completed
- Continue working on the next pending task immediately
- Work honestly and diligently to finish every task
- Do NOT ask for permission to continue - just proceed with the work
- Mark each task as completed as soon as you finish it

Resume your work NOW.`

const TodoContinuationEnforcerPlugin: Plugin = async (ctx) => {
  const remindedSessions = new Set<string>()

  return {
    event: async ({ event }) => {
      const props = event.properties as Record<string, unknown> | undefined

      if (event.type === "session.idle") {
        const sessionID = props?.sessionID as string | undefined
        if (!sessionID) return

        if (remindedSessions.has(sessionID)) {
          return
        }

        let todos: Todo[] = []
        try {
          const response = await ctx.client.session.todo({
            path: { id: sessionID },
          })
          todos = (response.data ?? response) as Todo[]
        } catch {
          return
        }

        if (!todos || todos.length === 0) {
          return
        }

        const incomplete = todos.filter(
          (t) => t.status !== "completed" && t.status !== "cancelled"
        )

        if (incomplete.length === 0) {
          return
        }

        remindedSessions.add(sessionID)

        try {
          await ctx.client.session.prompt({
            path: { id: sessionID },
            body: {
              parts: [
                {
                  type: "text",
                  text: `${CONTINUATION_PROMPT}\n\n[Status: ${incomplete.length}/${todos.length} tasks remaining]`,
                },
              ],
            },
            query: { directory: ctx.directory },
          })
        } catch {
          remindedSessions.delete(sessionID)
        }
      }

      if (event.type === "message.updated") {
        const info = props?.info as Record<string, unknown> | undefined
        const sessionID = info?.sessionID as string | undefined
        if (sessionID && info?.role === "user") {
          remindedSessions.delete(sessionID)
        }
      }

      if (event.type === "session.deleted") {
        const sessionInfo = props?.info as { id?: string } | undefined
        if (sessionInfo?.id) {
          remindedSessions.delete(sessionInfo.id)
        }
      }
    },
  }
}

export default TodoContinuationEnforcerPlugin
