import { useMemo, useState } from 'react'
import { Download, FolderOpen, Network, Pencil, Plus, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
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
  const t = useTranslate()
  const closeAgentsPage = useAppStore((s) => s.closeAgentsPage)
  const { snapshot, loading, error } = useAgentTeamsSnapshot()
  const [view, setView] = useState<View>('agents')
  const [agentDraft, setAgentDraftState] = useState<AgentDraft | null>(null)
  // Remounts the editor each time it opens, so its fields start from the new draft.
  const [agentEditorKey, setAgentEditorKey] = useState(0)
  const setAgentDraft = (draft: AgentDraft | null): void => {
    if (draft) {
      setAgentEditorKey((key) => key + 1)
    }
    setAgentDraftState(draft)
  }
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
            ? t('agentTeams.page.importAlreadyHere', 'Your OpenMausBot bots are already here.')
            : t('agentTeams.page.importNoneFound', 'No OpenMausBot bots were found.')
        )
        return
      }
      toast.success(
        t('agentTeams.page.imported', 'Imported {{names}}', { names: result.agents.join(', ') }),
        {
          description: t(
            'agentTeams.page.importedDescription',
            'Read-only copy: OpenMausBot is unchanged, and imported routines are not scheduled here, so nothing runs twice.'
          )
        }
      )
    } catch (caught) {
      toast.error(t('agentTeams.page.importFailed', 'Import failed.'), {
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
            size="icon-xs-round"
            onClick={closeAgentsPage}
            aria-label={t('agentTeams.page.close', 'Close agents')}
          >
            <X className="size-4" />
          </Button>
          <h1 className="text-sm font-semibold">{t('agentTeams.page.title', 'Agents')}</h1>
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {t('agentTeams.page.agentCount', '{{count}} agents', {
              count: agents.length,
              defaultValue_one: '{{count}} agent'
            })}{' '}
            ·{' '}
            {t('agentTeams.page.teamCount', '{{count}} teams', {
              count: teams.length,
              defaultValue_one: '{{count}} team'
            })}
          </span>
          <div className="ml-4 flex rounded-md border border-border p-0.5">
            {(
              [
                ['agents', t('agentTeams.page.agentsView', 'Agents'), Users],
                ['map', t('agentTeams.page.mapView', 'Team map'), Network]
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
              {t('agentTeams.page.files', 'Files')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void importMaus()}>
              <Download className="size-3.5" />
              {t('agentTeams.page.import', 'Import from OpenMausBot')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTeamEditor({ team: null })}>
              <Plus className="size-3.5" />
              {t('agentTeams.page.newTeam', 'New team')}
            </Button>
            <Button size="sm" onClick={() => setAgentDraft({})}>
              <Plus className="size-3.5" />
              {t('agentTeams.page.newAgent', 'New agent')}
            </Button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="border-b border-border px-8 py-2 text-xs text-destructive">{error}</div>
      ) : null}
      {snapshot.rejected.length > 0 ? (
        <div className="border-b border-border px-8 py-2 text-xs text-muted-foreground">
          {t(
            'agentTeams.page.rejected',
            '{{count}} agent or team files were skipped because they are not valid: {{files}}',
            {
              count: snapshot.rejected.length,
              defaultValue_one:
                '{{count}} agent or team file was skipped because they are not valid: {{files}}',
              files: snapshot.rejected
                .map((r) => `${r.path} (${r.reason.split('\n')[0]})`)
                .join('; ')
            }
          )}
        </div>
      ) : null}

      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        {loading ? null : view === 'map' ? (
          <AgentTeamMap agents={agents} teams={teams} onOpenAgent={(a) => setAgentDraft(a)} />
        ) : (
          <div className="flex w-full flex-col gap-8 px-5 py-6 md:px-8">
            {agents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <div className="text-sm font-medium">
                  {t('agentTeams.page.emptyTitle', 'No agents yet')}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t(
                    'agentTeams.page.emptyDescription',
                    'Give an agent a name, a picture and a personality. It can hire its own sub-agents, and agents on a team share instructions and a department memory.'
                  )}
                </div>
                <div className="mt-4 flex justify-center gap-2">
                  <Button size="sm" onClick={() => setAgentDraft({})}>
                    <Plus className="size-3.5" />
                    {t('agentTeams.page.newAgent', 'New agent')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void importMaus()}>
                    <Download className="size-3.5" />
                    {t('agentTeams.page.import', 'Import from OpenMausBot')}
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
                    <h2 className="text-sm font-semibold">
                      {team ? team.name : t('agentTeams.page.noTeam', 'No team')}
                    </h2>
                    {team?.description ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {team.description}
                      </span>
                    ) : null}
                    {team ? (
                      <>
                        <Button size="xs" variant="ghost" onClick={() => setTeamEditor({ team })}>
                          <Pencil className="size-3" />
                          {t('agentTeams.page.teamInstructions', 'Instructions & memory')}
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setAgentDraft({ teamId: team.id })}
                        >
                          <Plus className="size-3" />
                          {t('agentTeams.page.addMember', 'Add member')}
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
                    <div className="text-xs text-muted-foreground">
                      {t('agentTeams.page.noMembers', 'No members yet.')}
                    </div>
                  )}
                </section>
              ) : null
            )}
          </div>
        )}
      </div>

      <AgentEditorDialog
        key={agentEditorKey}
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
