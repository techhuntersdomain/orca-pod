import { z } from 'zod'

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)

/** Agents and sub-agents may write these files; every read goes through the schema. */
export const AgentProfileSchema = z.object({
  id,
  name: z.string().trim().min(1).max(60),
  title: z.string().max(120).default(''),
  soul: z.string().max(40_000).default(''),
  color: z.string().max(24).default('violet'),
  avatarFile: z.string().max(80).nullable().default(null),
  agent: z.string().max(40).default('claude'),
  model: z.string().max(80).nullable().default(null),
  folder: z.string().max(1024).nullable().default(null),
  teamId: id.nullable().default(null),
  parentId: id.nullable().default(null),
  commands: z
    .array(z.object({ name: z.string().min(1).max(40), prompt: z.string().max(8000) }))
    .max(40)
    .default([]),
  routines: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        prompt: z.string().max(8000),
        schedule: z.string().max(120),
        automationId: z.string().max(120).nullable().default(null)
      })
    )
    .max(40)
    .default([]),
  createdBy: z.string().max(80).default('person'),
  origin: z.string().max(80).nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type AgentProfile = z.infer<typeof AgentProfileSchema>

export const AgentTeamSchema = z.object({
  id,
  name: z.string().trim().min(1).max(60),
  description: z.string().max(400).default(''),
  instructions: z.string().max(40_000).default(''),
  color: z.string().max(24).default('teal'),
  leadId: id.nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type AgentTeam = z.infer<typeof AgentTeamSchema>

export type AgentTeamsSnapshot = {
  agents: AgentProfile[]
  teams: AgentTeam[]
  /** Files that failed validation, so a bad write by an agent is visible instead of silently lost. */
  rejected: { path: string; reason: string }[]
  home: string
}

export type AgentLaunchBrief = {
  briefPath: string
  agentDir: string
  teamDir: string | null
  firstMessage: string
}

export const AGENT_COLORS = [
  'violet',
  'teal',
  'blue',
  'pink',
  'amber',
  'green',
  'red',
  'slate'
] as const

export function slugForName(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'agent'
  let slug = base
  for (let n = 2; taken.has(slug); n++) {
    slug = `${base}-${n}`
  }
  return slug
}
