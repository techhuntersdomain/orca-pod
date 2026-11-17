import { useMemo, useState } from 'react'
import { Download, FolderOpen, Network, Pencil, Plus, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/class-names'
import { useAppStore } from '@/store/index'
import type { AgentProfile, AgentTeam } from '../../../../shared/agent-teams/agent-team-types'
import { AgentCard } from './AgentCard'
import { AgentEditorDialog, type AgentDraft } from './AgentEditorDialog'
import { agentColor } from './AgentAvatar'
import { AgentTeamMap } from './AgentTeamMap'
import { startAgentProfile } from './agent-profile-launch'
import { TeamEditorDialog } from './TeamEditorDialog'
import { useAgentTeamsSnapshot } from './use-agent-teams'

type View = 'agents' | 'map'

export default function AgentTeamsPage(): React.JSX.Element {
  const closeAgentsPage = useAppStore((s) => s.closeAgentsPage)
  const { snapshot, loading, error } = useAgentTeamsSnapshot()
  const [view, setView] = useState<View>('agents')
  const [agentDraft, setAgentDraft] = useState<AgentDraft | null>(null)
  const [teamEditor, setTeamEditor] = useState<{ team: AgentTeam | null } | null>(null)
  const { agents, teams } = snapshot

  const sections = useMemo(() => {
    const ids = new Set(agents.map((a) => a.id))
    const topLevel = (a: AgentProfile): boolean => !a.parentId || !ids.has(a.parentId)
    const rows: { team: AgentTeam | null; agents: AgentProfile[] }[] = teams.map((team) => ({
      team,
      agents: agents.filter((a) => a.teamId === team.id && topLevel(a))
    }))
    const loose = agents.filter((a) => !a.teamId && topLevel(a))
    if (loose.length > 0 || teams.length === 0) {
      rows.push({ team: null, agents: loose })
    }
    return rows
  }, [agents, teams])

  const subAgentsOf = (id: string): AgentProfile[] => agents.filter((a) => a.parentId === id)

  async function importMaus(): Promise<void> {
    try {
      const result = await window.api.agentTeams.importOpenMausBot()
      if (result.agents.length === 0) {
        toast.message(
          result.skipped.length > 0
            ? 'Your OpenMausBot bots are already here.'
            : 'No OpenMausBot bots were found.'
        )
        return
      }
      toast.success(`Imported ${result.agents.join(', ')}`, {
        description:
          'Read-only copy: OpenMausBot is unchanged, and imported routines are not scheduled here, so nothing runs twice.'
      })
    } catch (caught) {
      toast.error('Import failed.', {
        description: caught instanceof Error ? caught.message : String(caught)
      })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border">
        <div className="flex w-full flex-wrap items-center gap-2 px-5 py-3 md:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 rounded-full"
            onClick={closeAgentsPage}
            aria-label="Close agents"
          >
            <X className="size-4" />
          </Button>
          <h1 className="text-sm font-semibold">Agents</h1>
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {agents.length} agent{agents.length === 1 ? '' : 's'} · {teams.length} team
            {teams.length === 1 ? '' : 's'}
          </span>
          <div className="ml-4 flex rounded-md border border-border p-0.5">
            {(
              [
                ['agents', 'Agents', Users],
                ['map', 'Team map', Network]
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1 text-xs',
                  view === key ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void window.api.agentTeams.revealHome()}
            >
              <FolderOpen className="size-3.5" />
              Files
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void importMaus()}>
              <Download className="size-3.5" />
              Import from OpenMausBot
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTeamEditor({ team: null })}>
              <Plus className="size-3.5" />
              New team
            </Button>
            <Button size="sm" onClick={() => setAgentDraft({})}>
              <Plus className="size-3.5" />
              New agent
            </Button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="border-b border-border px-8 py-2 text-xs text-destructive">{error}</div>
      ) : null}
      {snapshot.rejected.length > 0 ? (
        <div className="border-b border-border px-8 py-2 text-xs text-muted-foreground">
          {snapshot.rejected.length} agent or team file
          {snapshot.rejected.length === 1 ? ' was' : 's were'} skipped because they are not valid:{' '}
          {snapshot.rejected.map((r) => `${r.path} (${r.reason.split('\n')[0]})`).join('; ')}
        </div>
      ) : null}

      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        {loading ? null : view === 'map' ? (
          <AgentTeamMap agents={agents} teams={teams} onOpenAgent={(a) => setAgentDraft(a)} />
        ) : (
          <div className="flex w-full flex-col gap-8 px-5 py-6 md:px-8">
            {agents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <div className="text-sm font-medium">No agents yet</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Give an agent a name, a picture and a personality. It can hire its own sub-agents,
                  and agents on a team share instructions and a department memory.
                </div>
                <div className="mt-4 flex justify-center gap-2">
                  <Button size="sm" onClick={() => setAgentDraft({})}>
                    <Plus className="size-3.5" />
                    New agent
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void importMaus()}>
                    <Download className="size-3.5" />
                    Import from OpenMausBot
                  </Button>
                </div>
              </div>
            ) : null}
            {sections.map(({ team, agents: members }) =>
              team || members.length > 0 ? (
                <section key={team?.id ?? 'no-team'} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    {team ? (
                      <span
                        className={cn(
                          'size-2.5 rounded-full',
                          agentColor(team.color).fill,
                          'ring-2',
                          agentColor(team.color).ring
                        )}
                      />
                    ) : null}
                    <h2 className="text-sm font-semibold">{team ? team.name : 'No team'}</h2>
                    {team?.description ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {team.description}
                      </span>
                    ) : null}
                    {team ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => setTeamEditor({ team })}
                        >
                          <Pencil className="size-3" />
                          Instructions & memory
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => setAgentDraft({ teamId: team.id })}
                        >
                          <Plus className="size-3" />
                          Add member
                        </Button>
                      </>
                    ) : null}
                  </div>
                  {members.length > 0 ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
                      {members.map((agent) => (
                        <AgentCard
                          key={agent.id}
                          agent={agent}
                          subAgents={subAgentsOf(agent.id)}
                          onEdit={(a) => setAgentDraft(a)}
                          onStart={(a) => void startAgentProfile(a)}
                          onAddSubAgent={(parent) =>
                            setAgentDraft({
                              parentId: parent.id,
                              teamId: parent.teamId,
                              folder: parent.folder
                            })
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No members yet.</div>
                  )}
                </section>
              ) : null
            )}
          </div>
        )}
      </div>

      <AgentEditorDialog
        draft={agentDraft}
        agents={agents}
        teams={teams}
        onClose={() => setAgentDraft(null)}
      />
      <TeamEditorDialog
        open={teamEditor !== null}
        team={teamEditor?.team ?? null}
        teams={teams}
        agents={agents}
        onClose={() => setTeamEditor(null)}
      />
    </div>
  )
}
