import { useMemo, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import {
  AGENT_COLORS,
  slugForName,
  type AgentProfile,
  type AgentTeam
} from '../../../../shared/agent-teams/agent-team-types'
import { AgentAvatar, agentColor } from './AgentAvatar'
import { AgentSelectField, NO_CHOICE } from './AgentSelectField'

const ENGINES = ['claude', 'codex', 'hermes', 'gemini', 'opencode', 'cursor'] as const
const NONE = NO_CHOICE

export type AgentDraft = Partial<AgentProfile> & {
  teamId?: string | null
  parentId?: string | null
}

type AgentFields = Omit<
  AgentProfile,
  'avatarFile' | 'routines' | 'createdBy' | 'origin' | 'createdAt' | 'updatedAt'
>

/** The saved profile: the edited fields over what the existing agent already had. */
function buildAgentProfile(fields: AgentFields, existing: AgentProfile | undefined): AgentProfile {
  const now = Date.now()
  return {
    ...fields,
    avatarFile: existing?.avatarFile ?? null,
    routines: existing?.routines ?? [],
    createdBy: existing?.createdBy ?? 'person',
    origin: existing?.origin ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }
}

function parseCommands(text: string): AgentProfile['commands'] {
  return text
    .split('\n')
    .map((line) => line.trim().match(/^\/?([\w-]{1,40})\s+([\s\S]+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ name: m[1], prompt: m[2] }))
}

/** Mount with a fresh `key` each time a draft is opened, so the fields start from that draft. */
export function AgentEditorDialog({
  draft,
  agents,
  teams,
  onClose
}: {
  draft: AgentDraft | null
  agents: readonly AgentProfile[]
  teams: readonly AgentTeam[]
  onClose: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const confirm = useConfirmationDialog()
  // A new agent is saved the moment it gets a picture; keep that id so Save updates it instead of adding a second one.
  const [savedId, setSavedId] = useState<string | null>(null)
  const editingId = draft?.id ?? savedId
  const existing = editingId ? agents.find((a) => a.id === editingId) : undefined
  const [name, setName] = useState(draft?.name ?? '')
  const [title, setTitle] = useState(draft?.title ?? '')
  const [soul, setSoul] = useState(draft?.soul ?? '')
  const [color, setColor] = useState<string>(draft?.color ?? 'violet')
  const [engine, setEngine] = useState(draft?.agent ?? 'claude')
  const [model, setModel] = useState(draft?.model ?? '')
  const [folder, setFolder] = useState(draft?.folder ?? '')
  const [teamId, setTeamId] = useState(draft?.teamId ?? NONE)
  const [parentId, setParentId] = useState(draft?.parentId ?? NONE)
  const [commands, setCommands] = useState(() =>
    (draft?.commands ?? []).map((c) => `/${c.name} ${c.prompt}`).join('\n')
  )
  const [busy, setBusy] = useState(false)

  const parentOptions = useMemo(
    () => [
      {
        value: NONE,
        label: t('agentTeams.agentEditor.parentNone', 'Nobody (top-level agent)')
      },
      ...agents.filter((a) => a.id !== editingId).map((a) => ({ value: a.id, label: a.name }))
    ],
    [agents, editingId, t]
  )

  async function save(): Promise<AgentProfile | null> {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error(t('agentTeams.agentEditor.nameRequired', 'Give the agent a name.'))
      return null
    }
    setBusy(true)
    try {
      const id = existing?.id ?? savedId ?? slugForName(trimmed, new Set(agents.map((a) => a.id)))
      const profile = buildAgentProfile(
        {
          id,
          name: trimmed,
          title: title.trim(),
          soul,
          color,
          agent: engine,
          model: model.trim() || null,
          folder: folder.trim() || null,
          teamId: teamId === NONE ? null : teamId,
          parentId: parentId === NONE ? null : parentId,
          commands: parseCommands(commands)
        },
        existing
      )
      const saved = await window.api.agentTeams.saveAgent(profile)
      setSavedId(saved.id)
      return saved
    } catch (error) {
      toast.error(t('agentTeams.agentEditor.saveFailed', 'Could not save the agent.'), {
        description: error instanceof Error ? error.message : String(error)
      })
      return null
    } finally {
      setBusy(false)
    }
  }

  async function pickPicture(): Promise<void> {
    const saved = existing ?? (await save())
    if (!saved) {
      return
    }
    try {
      await window.api.agentTeams.pickAvatar(saved.id)
    } catch (error) {
      toast.error(t('agentTeams.agentEditor.pictureFailed', 'Could not use that picture.'), {
        description: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async function remove(): Promise<void> {
    if (!existing) {
      return
    }
    const sure = await confirm({
      title: t('agentTeams.agentEditor.removeTitle', 'Remove {{name}}?', { name: existing.name }),
      description: t(
        'agentTeams.agentEditor.removeDescription',
        "This deletes {{name}}'s profile, picture and memory file. It cannot be undone.",
        { name: existing.name }
      ),
      confirmLabel: t('agentTeams.agentEditor.removeConfirm', 'Remove'),
      confirmVariant: 'destructive'
    })
    if (!sure) {
      return
    }
    await window.api.agentTeams.deleteAgent(existing.id)
    toast.success(
      t('agentTeams.agentEditor.removed', '{{name}} was removed.', { name: existing.name })
    )
    onClose()
  }

  const preview = existing ?? { id: 'new', name: name || '?', color, avatarFile: null }

  return (
    <Dialog open={draft !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent scrollable className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {existing
              ? t('agentTeams.agentEditor.editTitle', 'Edit {{name}}', { name: existing.name })
              : t('agentTeams.agentEditor.newTitle', 'New agent')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'agentTeams.agentEditor.description',
              'Who this agent is, how it works, and who it works with. It reads this every time it starts.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <AgentAvatar agent={{ ...preview, color }} size={64} />
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void pickPicture()}
                disabled={busy}
              >
                <ImagePlus className="size-3.5" />
                {existing?.avatarFile
                  ? t('agentTeams.agentEditor.changePicture', 'Change picture')
                  : t('agentTeams.agentEditor.addPicture', 'Add picture')}
              </Button>
              <div className="flex gap-1.5">
                {AGENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      'size-5 rounded-full ring-2',
                      agentColor(c).fill,
                      color === c ? agentColor(c).ring : 'ring-transparent'
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label variant="settings">{t('agentTeams.agentEditor.name', 'Name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('agentTeams.agentEditor.namePlaceholder', 'Frisky')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label variant="settings">{t('agentTeams.agentEditor.jobTitle', 'Job title')}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('agentTeams.agentEditor.jobTitlePlaceholder', 'Head of content')}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label variant="settings">
              {t('agentTeams.agentEditor.soul', 'Personality and instructions')}
            </Label>
            <Textarea
              value={soul}
              onChange={(e) => setSoul(e.target.value)}
              rows={8}
              placeholder={t(
                'agentTeams.agentEditor.soulPlaceholder',
                'Who the agent is, how it talks, what it is responsible for, what it must never do.'
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AgentSelectField
              label={t('agentTeams.agentEditor.engine', 'Engine')}
              value={engine}
              onChange={setEngine}
              options={ENGINES.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) }))}
            />
            <div className="flex flex-col gap-1.5">
              <Label variant="settings">
                {t('agentTeams.agentEditor.model', 'Model (optional)')}
              </Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t('agentTeams.agentEditor.modelPlaceholder', 'default')}
              />
            </div>
            <AgentSelectField
              label={t('agentTeams.agentEditor.team', 'Team')}
              value={teamId}
              onChange={setTeamId}
              options={[
                { value: NONE, label: t('agentTeams.agentEditor.noTeam', 'No team') },
                ...teams.map((team) => ({ value: team.id, label: team.name }))
              ]}
            />
            <AgentSelectField
              label={t('agentTeams.agentEditor.worksFor', 'Works for')}
              value={parentId}
              onChange={setParentId}
              options={parentOptions}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label variant="settings">{t('agentTeams.agentEditor.folder', 'Working folder')}</Label>
            <div className="flex gap-2">
              <Input
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder={t(
                  'agentTeams.agentEditor.folderPlaceholder',
                  'Starts in the workspace you have open'
                )}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const picked = await window.api.repos.pickDirectory()
                  if (picked) {
                    setFolder(picked)
                  }
                }}
              >
                {t('agentTeams.agentEditor.chooseFolder', 'Choose')}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label variant="settings">
              {t('agentTeams.agentEditor.commands', 'Commands — one per line: /name what to do')}
            </Label>
            <Textarea
              value={commands}
              onChange={(e) => setCommands(e.target.value)}
              rows={3}
              placeholder={t(
                'agentTeams.agentEditor.commandsPlaceholder',
                '/status Check the system and report what the next post would be.'
              )}
            />
          </div>
          {existing && existing.routines.length > 0 ? (
            <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
              <div className="mb-1 font-medium text-foreground">
                {t('agentTeams.agentEditor.routines', 'Routines')}
              </div>
              {existing.routines.map((r) => (
                <div key={r.name}>
                  {r.name} — {r.schedule}
                  {r.automationId
                    ? ''
                    : ` ${t('agentTeams.agentEditor.notScheduled', '(not scheduled here)')}`}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter className="sm:justify-between">
          {existing ? (
            <Button variant="destructive" onClick={() => void remove()}>
              <Trash2 className="size-3.5" />
              {t('agentTeams.agentEditor.remove', 'Remove')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('agentTeams.agentEditor.cancel', 'Cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (await save()) {
                  onClose()
                }
              }}
            >
              {t('agentTeams.agentEditor.save', 'Save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
