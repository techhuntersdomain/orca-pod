import { cn } from '@/lib/class-names'
import type { AgentProfile } from '../../../../shared/agent-teams/agent-team-types'
import { useAgentAvatarUrl } from './use-agent-teams'

/** Tailwind palette steps per agent colour; the default tokens carry no per-entity hue. */
export const AGENT_COLOR_CLASSES: Record<string, { ring: string; fill: string; text: string }> = {
  violet: { ring: 'ring-violet-500/60', fill: 'bg-violet-500/20', text: 'text-violet-300' },
  teal: { ring: 'ring-teal-400/60', fill: 'bg-teal-400/20', text: 'text-teal-300' },
  blue: { ring: 'ring-blue-500/60', fill: 'bg-blue-500/20', text: 'text-blue-300' },
  pink: { ring: 'ring-pink-500/60', fill: 'bg-pink-500/20', text: 'text-pink-300' },
  amber: { ring: 'ring-amber-400/60', fill: 'bg-amber-400/20', text: 'text-amber-300' },
  green: { ring: 'ring-emerald-500/60', fill: 'bg-emerald-500/20', text: 'text-emerald-300' },
  red: { ring: 'ring-red-500/60', fill: 'bg-red-500/20', text: 'text-red-300' },
  slate: { ring: 'ring-slate-400/60', fill: 'bg-slate-400/20', text: 'text-slate-300' }
}

export function agentColor(color: string): { ring: string; fill: string; text: string } {
  return AGENT_COLOR_CLASSES[color] ?? AGENT_COLOR_CLASSES.violet
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function AgentAvatar({
  agent,
  size = 48,
  className
}: {
  agent: Pick<AgentProfile, 'id' | 'name' | 'color' | 'avatarFile'>
  size?: number
  className?: string
}): React.JSX.Element {
  const url = useAgentAvatarUrl(agent.id, agent.avatarFile)
  const color = agentColor(agent.color)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-2',
        color.ring,
        color.fill,
        className
      )}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" draggable={false} />
      ) : (
        <span
          className={cn('font-semibold', color.text)}
          style={{ fontSize: Math.round(size * 0.36) }}
        >
          {initials(agent.name)}
        </span>
      )}
    </span>
  )
}
