import type { AgentProfile, AgentTeam } from './agent-team-types'

/** Files keep whatever ids agents wrote; for display, a missing team or parent reads as none and a
 * hiring loop (A hired B, B hired A) is cut where it closes, so every agent still appears once. */
export function resolveAgentLinks(
  agents: readonly AgentProfile[],
  teams: readonly AgentTeam[]
): AgentProfile[] {
  const teamIds = new Set(teams.map((t) => t.id))
  const byId = new Map(agents.map((a) => [a.id, a]))
  const parentOf = (a: AgentProfile): string | null =>
    a.parentId && a.parentId !== a.id && byId.has(a.parentId) ? a.parentId : null
  return agents.map((agent) => {
    const teamId = agent.teamId && teamIds.has(agent.teamId) ? agent.teamId : null
    let parentId = parentOf(agent)
    // Cut only when the chain comes back to this agent; a loop further up is cut at its own members.
    const seen = new Set<string>()
    for (let up = parentId; up && !seen.has(up); up = parentOf(byId.get(up)!)) {
      if (up === agent.id) {
        parentId = null
        break
      }
      seen.add(up)
    }
    return teamId === agent.teamId && parentId === agent.parentId
      ? agent
      : { ...agent, teamId, parentId }
  })
}
