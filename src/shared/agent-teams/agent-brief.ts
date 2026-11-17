import type { AgentProfile, AgentTeam } from './agent-team-types'

export type AgentBriefPaths = {
  home: string
  agentDir: string
  teamDir: string | null
}

/** One file an agent reads at start: who it is, its team's shared rules, where memory lives, how to hire help. */
export function composeAgentBrief(
  agent: AgentProfile,
  team: AgentTeam | null,
  teammates: readonly AgentProfile[],
  paths: AgentBriefPaths
): string {
  const lines: string[] = [
    `# You are ${agent.name}`,
    agent.title ? `_${agent.title}_` : '',
    '',
    agent.soul.trim() || 'No personality written yet. Be helpful, direct and honest.',
    ''
  ]
  if (team) {
    lines.push(
      `## Your team: ${team.name}`,
      team.description ? team.description : '',
      '',
      team.instructions.trim() || '(No shared team instructions yet.)',
      '',
      `Team memory (shared by everyone on ${team.name}): ${paths.teamDir}/MEMORY.md — read it now; add what the whole team should know.`,
      ''
    )
    const others = teammates.filter((m) => m.id !== agent.id)
    if (others.length > 0) {
      lines.push(
        'Teammates:',
        ...others.map((m) => `- ${m.name}${m.title ? ` — ${m.title}` : ''}`),
        ''
      )
    }
  }
  lines.push(
    '## Memory',
    `Your own memory: ${paths.agentDir}/MEMORY.md — read it now. Before you finish a piece of work, add what you will need next time (decisions, facts, open threads). Keep it short and current.`,
    ''
  )
  if (agent.commands.length > 0) {
    lines.push(
      '## Your commands',
      'When the person types one of these, follow its instructions:',
      ...agent.commands.map((c) => `- /${c.name}: ${c.prompt}`),
      ''
    )
  }
  lines.push(
    '## Hiring a sub-agent',
    `To create a helper that works for you, write a JSON file at ${paths.home}/agents/<new-id>/agent.json with fields: id (lowercase-dashes), name, title, soul, agent ("claude" or "codex"), teamId (${team ? `"${team.id}"` : 'null'}), parentId ("${agent.id}"), createdBy ("${agent.id}"), createdAt and updatedAt (milliseconds). It appears on the Agents page; the person starts it, or you start it with Orca's orchestration tools.`,
    ''
  )
  return lines.filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n')
}

export function agentFirstMessage(agent: AgentProfile, briefPath: string, task?: string): string {
  const intro = `You are ${agent.name}. Your instructions, team rules and memory locations are in ${briefPath}. Read that file and your memory files before anything else.`
  return task?.trim()
    ? `${intro}\n\nTask: ${task.trim()}`
    : `${intro} Then say hello in one line and wait.`
}

/** Claude reads the brief as real system instructions; other CLIs get it through the first message only. */
export function agentLaunchArgs(
  agent: AgentProfile,
  briefPath: string,
  dirs: readonly string[]
): string | null {
  if (agent.agent !== 'claude') {
    return agent.model && agent.agent === 'codex' ? `-m ${agent.model}` : null
  }
  const parts = [`--append-system-prompt-file ${briefPath}`, ...dirs.map((d) => `--add-dir ${d}`)]
  if (agent.model) {
    parts.push(`--model ${agent.model}`)
  }
  return parts.join(' ')
}
