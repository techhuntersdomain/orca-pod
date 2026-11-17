import { useEffect, useMemo, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  AGENT_COLORS,
  slugForName,
  type AgentProfile,
  type AgentTeam
} from '../../../../shared/agent-teams/agent-team-types'
import { AgentAvatar, agentColor } from './AgentAvatar'

const ENGINES = ['claude', 'codex', 'hermes', 'gemini', 'opencode', 'cursor'] as const
const NONE = ''

export type AgentDraft = Partial<AgentProfile> & {
  teamId?: string | null
  parentId?: string | null
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string }[]
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <select
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

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
  const existing = draft?.id ? agents.find((a) => a.id === draft.id) : undefined
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [soul, setSoul] = useState('')
  const [color, setColor] = useState<string>('violet')
  const [engine, setEngine] = useState('claude')
  const [model, setModel] = useState('')
  const [folder, setFolder] = useState('')
  const [teamId, setTeamId] = useState(NONE)
  const [parentId, setParentId] = useState(NONE)
  const [commands, setCommands] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!draft) {
      return
    }
    setName(draft.name ?? '')
    setTitle(draft.title ?? '')
    setSoul(draft.soul ?? '')
    setColor(draft.color ?? 'violet')
    setEngine(draft.agent ?? 'claude')
    setModel(draft.model ?? '')
    setFolder(draft.folder ?? '')
    setTeamId(draft.teamId ?? NONE)
    setParentId(draft.parentId ?? NONE)
    setCommands((draft.commands ?? []).map((c) => `/${c.name} ${c.prompt}`).join('\n'))
  }, [draft])

  const parentOptions = useMemo(
    () => [
      { value: NONE, label: 'Nobody (top-level agent)' },
      ...agents.filter((a) => a.id !== draft?.id).map((a) => ({ value: a.id, label: a.name }))
    ],
    [agents, draft?.id]
  )

  async function save(): Promise<AgentProfile | null> {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Give the agent a name.')
      return null
    }
    setBusy(true)
    try {
      const now = Date.now()
      const id = existing?.id ?? slugForName(trimmed, new Set(agents.map((a) => a.id)))
      return await window.api.agentTeams.saveAgent({
        ...(existing ?? {
          routines: [],
          createdBy: 'person',
          origin: null,
          avatarFile: null,
          createdAt: now
        }),
        id,
        name: trimmed,
        title: title.trim(),
        soul,
        color,
        agent: engine,
        model: model.trim() || null,
        folder: folder.trim() || null,
        teamId: teamId || null,
        parentId: parentId || null,
        commands: commands
          .split('\n')
          .map((line) => line.trim().match(/^\/?([\w-]{1,40})\s+([\s\S]+)$/))
          .filter((m): m is RegExpMatchArray => m !== null)
          .map((m) => ({ name: m[1], prompt: m[2] })),
        updatedAt: now
      } as AgentProfile)
    } catch (error) {
      toast.error('Could not save the agent.', {
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
      toast.error('Could not use that picture.', {
        description: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async function remove(): Promise<void> {
    if (!existing) {
      return
    }
    await window.api.agentTeams.deleteAgent(existing.id)
    toast.success(`${existing.name} was removed.`)
    onClose()
  }

  const preview = existing ?? { id: 'new', name: name || '?', color, avatarFile: null }

  return (
    <Dialog open={draft !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="scrollbar-sleek max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.name}` : 'New agent'}</DialogTitle>
          <DialogDescription>
            Who this agent is, how it works, and who it works with. It reads this every time it
            starts.
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
                {existing?.avatarFile ? 'Change picture' : 'Add picture'}
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
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Frisky" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Job title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Head of content"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Personality and instructions</Label>
            <Textarea
              value={soul}
              onChange={(e) => setSoul(e.target.value)}
              rows={8}
              placeholder="Who the agent is, how it talks, what it is responsible for, what it must never do."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Engine"
              value={engine}
              onChange={setEngine}
              options={ENGINES.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) }))}
            />
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Model (optional)</Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="default"
              />
            </div>
            <SelectField
              label="Team"
              value={teamId}
              onChange={setTeamId}
              options={[
                { value: NONE, label: 'No team' },
                ...teams.map((t) => ({ value: t.id, label: t.name }))
              ]}
            />
            <SelectField
              label="Works for"
              value={parentId}
              onChange={setParentId}
              options={parentOptions}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Working folder</Label>
            <div className="flex gap-2">
              <Input
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="Starts in the workspace you have open"
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
                Choose
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Commands — one per line: /name what to do</Label>
            <Textarea
              value={commands}
              onChange={(e) => setCommands(e.target.value)}
              rows={3}
              placeholder="/status Check the system and report what the next post would be."
            />
          </div>
          {existing && existing.routines.length > 0 ? (
            <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
              <div className="mb-1 font-medium text-foreground">Routines</div>
              {existing.routines.map((r) => (
                <div key={r.name}>
                  {r.name} — {r.schedule}
                  {r.automationId ? '' : ' (not scheduled here)'}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {existing ? (
            <Button variant="ghost" onClick={() => void remove()}>
              <Trash2 className="size-3.5" />
              Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (await save()) {
                  onClose()
                }
              }}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
