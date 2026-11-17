import { Pencil, Play, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentStateDot, type AgentDotState } from '@/components/AgentStateDot'
import { useAppStore } from '@/store/index'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import type { AgentProfile } from '../../../../shared/agent-teams/agent-team-types'
import { AgentAvatar } from './AgentAvatar'
import { useLaunchedAgentTabs } from './use-agent-teams'

const ENGINE_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  hermes: 'Hermes',
  gemini: 'Gemini',
  opencode: 'OpenCode',
  cursor: 'Cursor'
}

export function engineLabel(agent: string): string {
  return ENGINE_LABELS[agent] ?? agent
}

/** The live state of the tab this agent was started in, or idle when it has none. */
export function useAgentProfileState(agentId: string): AgentDotState {
  const launched = useLaunchedAgentTabs()[agentId]
  return useAppStore((s) => {
    if (!launched) {
      return 'idle'
    }
    const prefix = `${launched.tabId}:`
    for (const [paneKey, entry] of Object.entries(s.agentStatusByPaneKey)) {
      if (paneKey.startsWith(prefix)) {
        return entry.state
      }
    }
    return 'idle'
  })
}

export function AgentCard({
  agent,
  subAgents,
  onEdit,
  onStart,
  onAddSubAgent,
  nested = false
}: {
  agent: AgentProfile
  subAgents: readonly AgentProfile[]
  onEdit: (agent: AgentProfile) => void
  onStart: (agent: AgentProfile) => void
  onAddSubAgent: (parent: AgentProfile) => void
  nested?: boolean
}): React.JSX.Element {
  const t = useTranslate()
  const state = useAgentProfileState(agent.id)
  return (
    <div
      className={cn(
        'group flex flex-col gap-3 rounded-lg border border-border bg-card p-4',
        nested && 'border-dashed p-3'
      )}
    >
      <div className="flex items-start gap-3">
        <AgentAvatar agent={agent} size={nested ? 36 : 48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{agent.name}</span>
            {state !== 'idle' ? <AgentStateDot state={state} size="sm" /> : null}
          </div>
          {agent.title ? (
            <div className="line-clamp-2 text-xs text-muted-foreground">{agent.title}</div>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5">{engineLabel(agent.agent)}</span>
            {agent.commands.length > 0 ? (
              <span className="rounded bg-muted px-1.5 py-0.5">
                {t('agentTeams.agentCard.commandCount', '{{count}} commands', {
                  count: agent.commands.length,
                  defaultValue_one: '{{count}} command'
                })}
              </span>
            ) : null}
            {agent.routines.length > 0 ? (
              <span className="rounded bg-muted px-1.5 py-0.5">
                {t('agentTeams.agentCard.routineCount', '{{count}} routines', {
                  count: agent.routines.length,
                  defaultValue_one: '{{count}} routine'
                })}
              </span>
            ) : null}
            {agent.createdBy !== 'person' && agent.createdBy !== 'openmausbot-import' ? (
              <span className="rounded bg-muted px-1.5 py-0.5">
                {t('agentTeams.agentCard.hiredBy', 'hired by {{name}}', { name: agent.createdBy })}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" onClick={() => onStart(agent)}>
          <Play className="size-3.5" />
          {t('agentTeams.agentCard.start', 'Start')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onEdit(agent)}>
          <Pencil className="size-3.5" />
          {t('agentTeams.agentCard.edit', 'Edit')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAddSubAgent(agent)}
          aria-label={t('agentTeams.agentCard.addSubAgentLabel', 'Add a sub-agent under {{name}}', {
            name: agent.name
          })}
        >
          <UserPlus className="size-3.5" />
          {t('agentTeams.agentCard.subAgent', 'Sub-agent')}
        </Button>
      </div>
      {subAgents.length > 0 ? (
        <div className="flex flex-col gap-2 border-l border-border pl-3">
          {subAgents.map((child) => (
            <AgentCard
              key={child.id}
              agent={child}
              subAgents={[]}
              onEdit={onEdit}
              onStart={onStart}
              onAddSubAgent={onAddSubAgent}
              nested
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
