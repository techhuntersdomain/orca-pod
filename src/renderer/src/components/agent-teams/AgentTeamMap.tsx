import { useMemo } from 'react'
import { AgentStateDot } from '@/components/AgentStateDot'
import type { AgentProfile, AgentTeam } from '../../../../shared/agent-teams/agent-team-types'
import { AgentAvatar, agentColor } from './AgentAvatar'
import { useAgentProfileState } from './AgentCard'

const COL = 150
const ROW = 130
const TOP = 40
const NODE = 56

type Placed = { agent: AgentProfile; x: number; y: number; parentX: number; parentY: number }
type TeamColumn = { id: string; name: string; color: string; x: number; width: number }

function childrenOf(agents: readonly AgentProfile[], parentId: string): AgentProfile[] {
  return agents.filter((a) => a.parentId === parentId)
}

function treeWidth(
  agents: readonly AgentProfile[],
  agent: AgentProfile,
  seen: Set<string>
): number {
  if (seen.has(agent.id)) {
    return 1
  }
  seen.add(agent.id)
  const kids = childrenOf(agents, agent.id)
  return Math.max(
    1,
    kids.reduce((n, k) => n + treeWidth(agents, k, seen), 0)
  )
}

/** Teams side by side; inside a team each top agent heads a tree of the sub-agents it hired. */
export function layoutTeamMap(
  agents: readonly AgentProfile[],
  teams: readonly AgentTeam[]
): { placed: Placed[]; columns: TeamColumn[]; width: number; height: number; rootX: number } {
  const groups: { id: string; name: string; color: string; tops: AgentProfile[] }[] = teams.map(
    (t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      tops: agents.filter(
        (a) =>
          a.teamId === t.id &&
          (!a.parentId || agents.find((p) => p.id === a.parentId)?.teamId !== t.id)
      )
    })
  )
  const loose = agents.filter(
    (a) => !a.teamId && (!a.parentId || agents.find((p) => p.id === a.parentId)?.teamId)
  )
  if (loose.length > 0) {
    groups.push({ id: '', name: 'No team', color: 'slate', tops: loose })
  }
  const placed: Placed[] = []
  const columns: TeamColumn[] = []
  let cursor = 0
  let maxDepth = 1
  const teamY = TOP + ROW * 0.8

  const place = (
    agent: AgentProfile,
    left: number,
    depth: number,
    parentX: number,
    parentY: number,
    seen: Set<string>
  ): void => {
    if (seen.has(agent.id)) {
      return
    }
    seen.add(agent.id)
    const width = treeWidth(agents, agent, new Set())
    const x = (left + width / 2) * COL
    const y = teamY + depth * ROW
    maxDepth = Math.max(maxDepth, depth)
    placed.push({ agent, x, y, parentX, parentY })
    let childLeft = left
    for (const child of childrenOf(agents, agent.id)) {
      place(child, childLeft, depth + 1, x, y, seen)
      childLeft += treeWidth(agents, child, new Set())
    }
  }

  const seen = new Set<string>()
  for (const group of groups) {
    const width = Math.max(
      1,
      group.tops.reduce((n, a) => n + treeWidth(agents, a, new Set()), 0)
    )
    const columnX = (cursor + width / 2) * COL
    columns.push({
      id: group.id,
      name: group.name,
      color: group.color,
      x: columnX,
      width: width * COL
    })
    let left = cursor
    for (const top of group.tops) {
      place(top, left, 1, columnX, teamY, seen)
      left += treeWidth(agents, top, new Set())
    }
    cursor += width
  }
  const width = Math.max(cursor, 1) * COL
  return { placed, columns, width, height: teamY + (maxDepth + 1) * ROW, rootX: width / 2 }
}

function MapNode({
  agent,
  x,
  y,
  onOpen
}: {
  agent: AgentProfile
  x: number
  y: number
  onOpen: (a: AgentProfile) => void
}): React.JSX.Element {
  const state = useAgentProfileState(agent.id)
  return (
    <foreignObject x={x - COL / 2} y={y - NODE / 2} width={COL} height={NODE + 44}>
      <button
        type="button"
        onClick={() => onOpen(agent)}
        className="flex w-full flex-col items-center gap-1 rounded-md text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative">
          <AgentAvatar agent={agent} size={NODE} />
          {state !== 'idle' ? (
            <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-background p-0.5">
              <AgentStateDot state={state} size="sm" />
            </span>
          ) : null}
        </span>
        <span className="max-w-full truncate px-1 text-xs font-medium text-foreground">
          {agent.name}
        </span>
        {agent.title ? (
          <span className="max-w-full truncate px-1 text-[10px] text-muted-foreground">
            {agent.title}
          </span>
        ) : null}
      </button>
    </foreignObject>
  )
}

export function AgentTeamMap({
  agents,
  teams,
  onOpenAgent
}: {
  agents: readonly AgentProfile[]
  teams: readonly AgentTeam[]
  onOpenAgent: (agent: AgentProfile) => void
}): React.JSX.Element {
  const layout = useMemo(() => layoutTeamMap(agents, teams), [agents, teams])
  if (agents.length === 0 && teams.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        No agents yet. Create one, or import your OpenMausBot bots.
      </div>
    )
  }
  const teamY = TOP + ROW * 0.8
  return (
    <div className="scrollbar-sleek h-full overflow-auto p-6">
      <svg width={layout.width} height={layout.height} className="mx-auto block overflow-visible">
        {layout.columns.map((column) => (
          <path
            key={`root-${column.id}`}
            d={`M ${layout.rootX} ${TOP + 16} C ${layout.rootX} ${TOP + 50}, ${column.x} ${teamY - 50}, ${column.x} ${teamY - 18}`}
            className="fill-none stroke-border"
            strokeWidth={1.5}
          />
        ))}
        {layout.placed.map((p) => (
          <path
            key={`edge-${p.agent.id}`}
            d={`M ${p.parentX} ${p.parentY + 16} C ${p.parentX} ${p.parentY + 60}, ${p.x} ${p.y - 70}, ${p.x} ${p.y - NODE / 2}`}
            className="fill-none stroke-border"
            strokeWidth={1.5}
            strokeDasharray={p.agent.parentId ? '4 4' : undefined}
          />
        ))}
        <foreignObject x={layout.rootX - 40} y={TOP - 14} width={80} height={32}>
          <div className="flex h-full items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground">
            You
          </div>
        </foreignObject>
        {layout.columns.map((column) => (
          <foreignObject
            key={`team-${column.id}`}
            x={column.x - 70}
            y={teamY - 18}
            width={140}
            height={34}
          >
            <div
              className={`flex h-full items-center justify-center truncate rounded-md px-2 text-xs font-semibold ring-1 ${agentColor(column.color).fill} ${agentColor(column.color).ring} ${agentColor(column.color).text}`}
            >
              {column.name}
            </div>
          </foreignObject>
        ))}
        {layout.placed.map((p) => (
          <MapNode key={p.agent.id} agent={p.agent} x={p.x} y={p.y} onOpen={onOpenAgent} />
        ))}
      </svg>
    </div>
  )
}
