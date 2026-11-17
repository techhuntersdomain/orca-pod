import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
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
import { agentColor } from './AgentAvatar'
import { AgentSelectField, NO_CHOICE } from './AgentSelectField'

export function TeamEditorDialog({
  team,
  open,
  teams,
  agents,
  onClose
}: {
  team: AgentTeam | null
  open: boolean
  teams: readonly AgentTeam[]
  agents: readonly AgentProfile[]
  onClose: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const confirm = useConfirmationDialog()
  const [memory, setMemory] = useState('')
  // What was on disk when the dialog opened; null until read, so Save never writes a half-loaded memory.
  const [memoryOnDisk, setMemoryOnDisk] = useState<string | null>(null)
  const [color, setColor] = useState('teal')
  const [leadId, setLeadId] = useState(NO_CHOICE)

  useEffect(() => {
    if (!open) {
      return
    }
    setName(team?.name ?? '')
    setDescription(team?.description ?? '')
    setInstructions(team?.instructions ?? '')
    setColor(team?.color ?? 'teal')
    setLeadId(team?.leadId ?? NO_CHOICE)
    setMemory('')
    setMemoryOnDisk(null)
    if (team) {
      void window.api.agentTeams.readMemory('team', team.id).then((text) => {
        setMemory(text)
        setMemoryOnDisk(text)
      })
    }
  }, [open, team])

  async function save(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error(t('agentTeams.teamEditor.nameRequired', 'Give the team a name.'))
      return
    }
    const now = Date.now()
    const id = team?.id ?? slugForName(trimmed, new Set(teams.map((other) => other.id)))
    try {
      await window.api.agentTeams.saveTeam({
        id,
        name: trimmed,
        description: description.trim(),
        instructions,
        color,
        leadId: leadId === NO_CHOICE ? null : leadId,
        createdAt: team?.createdAt ?? now,
        updatedAt: now
      })
      if (team && memoryOnDisk !== null && memory !== memoryOnDisk) {
        const written = await window.api.agentTeams.writeMemory('team', id, memoryOnDisk, memory)
        if (!written) {
          toast.error(
            t(
              'agentTeams.teamEditor.memoryConflict',
              'The team added to its memory while you were editing.'
            ),
            {
              description: t(
                'agentTeams.teamEditor.memoryConflictDescription',
                'The rest was saved. Reopen the team to see the new memory, then edit again.'
              )
            }
          )
        }
      }
      onClose()
    } catch (error) {
      toast.error(t('agentTeams.teamEditor.saveFailed', 'Could not save the team.'), {
        description: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const members = team ? agents.filter((a) => a.teamId === team.id) : []

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent scrollable className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {team
              ? t('agentTeams.teamEditor.editTitle', 'Edit {{name}}', { name: team.name })
              : t('agentTeams.teamEditor.newTitle', 'New team')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'agentTeams.teamEditor.description',
              'Shared instructions every member reads when it starts, and a department memory they all add to.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label variant="settings">{t('agentTeams.teamEditor.name', 'Name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('agentTeams.teamEditor.namePlaceholder', 'Content')}
              />
            </div>
            <AgentSelectField
              label={t('agentTeams.teamEditor.lead', 'Lead')}
              value={leadId}
              onChange={setLeadId}
              options={[
                { value: NO_CHOICE, label: t('agentTeams.teamEditor.noLead', 'No lead') },
                ...members.map((m) => ({ value: m.id, label: m.name }))
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label variant="settings">
              {t('agentTeams.teamEditor.purpose', 'What this team does')}
            </Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
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
          <div className="flex flex-col gap-1.5">
            <Label variant="settings">
              {t('agentTeams.teamEditor.instructions', 'Shared instructions')}
            </Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              placeholder={t(
                'agentTeams.teamEditor.instructionsPlaceholder',
                'Rules every member follows: tone, what needs approval, where work goes.'
              )}
            />
          </div>
          {team ? (
            <div className="flex flex-col gap-1.5">
              <Label variant="settings">
                {t('agentTeams.teamEditor.memory', 'Department memory (the team writes here too)')}
              </Label>
              <Textarea value={memory} onChange={(e) => setMemory(e.target.value)} rows={6} />
            </div>
          ) : null}
        </div>
        <DialogFooter className="sm:justify-between">
          {team ? (
            <Button
              variant="destructive"
              onClick={async () => {
                const sure = await confirm({
                  title: t('agentTeams.teamEditor.removeTitle', 'Remove {{name}}?', {
                    name: team.name
                  }),
                  description: t(
                    'agentTeams.teamEditor.removeDescription',
                    'This deletes the team, its shared instructions and its department memory. Its agents are kept, without a team.'
                  ),
                  confirmLabel: t('agentTeams.teamEditor.removeTeam', 'Remove team'),
                  confirmVariant: 'destructive'
                })
                if (!sure) {
                  return
                }
                await window.api.agentTeams.deleteTeam(team.id)
                toast.success(
                  t(
                    'agentTeams.teamEditor.removed',
                    '{{name}} was removed. Its agents are kept, without a team.',
                    { name: team.name }
                  )
                )
                onClose()
              }}
            >
              <Trash2 className="size-3.5" />
              {t('agentTeams.teamEditor.removeTeam', 'Remove team')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('agentTeams.teamEditor.cancel', 'Cancel')}
            </Button>
            <Button onClick={() => void save()}>{t('agentTeams.teamEditor.save', 'Save')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
