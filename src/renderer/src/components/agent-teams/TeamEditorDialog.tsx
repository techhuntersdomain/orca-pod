import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
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
import { agentColor } from './AgentAvatar'

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
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [memory, setMemory] = useState('')
  const [color, setColor] = useState('teal')
  const [leadId, setLeadId] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }
    setName(team?.name ?? '')
    setDescription(team?.description ?? '')
    setInstructions(team?.instructions ?? '')
    setColor(team?.color ?? 'teal')
    setLeadId(team?.leadId ?? '')
    setMemory('')
    if (team) {
      void window.api.agentTeams.readMemory('team', team.id).then(setMemory)
    }
  }, [open, team])

  async function save(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Give the team a name.')
      return
    }
    const now = Date.now()
    const id = team?.id ?? slugForName(trimmed, new Set(teams.map((t) => t.id)))
    try {
      await window.api.agentTeams.saveTeam({
        id,
        name: trimmed,
        description: description.trim(),
        instructions,
        color,
        leadId: leadId || null,
        createdAt: team?.createdAt ?? now,
        updatedAt: now
      })
      if (team) {
        await window.api.agentTeams.writeMemory('team', id, memory)
      }
      onClose()
    } catch (error) {
      toast.error('Could not save the team.', {
        description: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const members = team ? agents.filter((a) => a.teamId === team.id) : []

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="scrollbar-sleek max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{team ? `Edit ${team.name}` : 'New team'}</DialogTitle>
          <DialogDescription>
            Shared instructions every member reads when it starts, and a department memory they all
            add to.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Content" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Lead</Label>
              <select
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
              >
                <option value="">No lead</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">What this team does</Label>
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
            <Label className="text-xs">Shared instructions</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              placeholder="Rules every member follows: tone, what needs approval, where work goes."
            />
          </div>
          {team ? (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Department memory (the team writes here too)</Label>
              <Textarea value={memory} onChange={(e) => setMemory(e.target.value)} rows={6} />
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {team ? (
            <Button
              variant="ghost"
              onClick={async () => {
                await window.api.agentTeams.deleteTeam(team.id)
                toast.success(`${team.name} was removed. Its agents are kept, without a team.`)
                onClose()
              }}
            >
              <Trash2 className="size-3.5" />
              Remove team
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void save()}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
