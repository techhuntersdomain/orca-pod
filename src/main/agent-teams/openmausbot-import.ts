import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { z } from 'zod'
import {
  slugForName,
  type OpenMausBotImportResult
} from '../../shared/agent-teams/agent-team-types'
import {
  readAgentTeamsSnapshot,
  readMemory,
  saveAgent,
  saveTeam,
  setAgentAvatarFromFile,
  writeMemoryIfUnchanged
} from './agent-team-store'

const optionalText = z.string().optional().catch(undefined)
const MausBotSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: optionalText,
  description: optionalText,
  soul: optionalText,
  color: optionalText,
  section: optionalText,
  avatarUrl: optionalText,
  cwd: optionalText,
  modelSelection: z.object({ instanceId: optionalText }).optional().catch(undefined)
})
type MausBot = z.infer<typeof MausBotSchema>

const MausRoutineSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  botId: optionalText,
  schedule: z
    .object({
      type: optionalText,
      time: optionalText,
      everyMinutes: z.number().optional().catch(undefined),
      weekdays: z.array(z.number()).optional().catch(undefined)
    })
    .optional()
    .catch(undefined)
})
type MausRoutine = z.infer<typeof MausRoutineSchema>

/** Entries that do not match are left out; the rest import. */
function validEntries<T>(raw: unknown, schema: z.ZodType<T>): T[] {
  return Array.isArray(raw)
    ? raw.flatMap((entry) => {
        const parsed = schema.safeParse(entry)
        return parsed.success ? [parsed.data] : []
      })
    : []
}

const mausHome = (): string => process.env.OPENMAUSBOT_HOME || join(homedir(), '.openmausbot')
const SAFE_BOT_ID = /^[\w-]{1,80}$/

async function readJson(path: string): Promise<unknown> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    return parsed
  } catch {
    return null
  }
}

function describeSchedule(schedule: MausRoutine['schedule']): string {
  if (!schedule) {
    return 'manual'
  }
  if (schedule.type === 'daily' && schedule.time) {
    const days = schedule.weekdays
    return days && days.length > 0 && days.length < 7
      ? `weekly on days ${days.join(',')} at ${schedule.time}`
      : `daily at ${schedule.time}`
  }
  if (schedule.type === 'interval' && schedule.everyMinutes) {
    return `every ${schedule.everyMinutes} minutes`
  }
  return schedule.type ?? 'manual'
}

/** Strip a SKILL.md's frontmatter and its "A command the user wrote" preamble, keeping the instructions. */
function commandPrompt(skill: string): string {
  const body = skill.replace(/^---[\s\S]*?---\s*/, '')
  return body
    .split('\n')
    .filter((line) => !line.startsWith('# /') && !line.startsWith('A command the user wrote'))
    .join('\n')
    .trim()
}

/** Reads ~/.openmausbot and never writes there. Re-running skips bots already imported. */
export async function importFromOpenMausBot(): Promise<OpenMausBotImportResult> {
  const bots = validEntries(await readJson(join(mausHome(), 'bots.json')), MausBotSchema)
  const routines = validEntries(
    z
      .object({ routines: z.unknown() })
      .catch({ routines: [] })
      .parse(await readJson(join(mausHome(), 'routines.json'))).routines,
    MausRoutineSchema
  )
  const sectionContexts = z
    .object({ contexts: z.record(z.string(), z.string()).optional() })
    .catch({})
    .parse(await readJson(join(mausHome(), 'section-contexts.json')))
  const snapshot = await readAgentTeamsSnapshot()
  const result: OpenMausBotImportResult = {
    agents: [],
    teams: [],
    skipped: []
  }
  const takenAgents = new Set(snapshot.agents.map((a) => a.id))
  const takenTeams = new Set(snapshot.teams.map((t) => t.id))
  const teamIdBySection = new Map(snapshot.teams.map((t) => [t.name, t.id]))
  const now = Date.now()

  for (const bot of bots) {
    if (!SAFE_BOT_ID.test(bot.id)) {
      result.skipped.push(bot.name)
      continue
    }
    const origin = `openmausbot:${bot.id}`
    if (snapshot.agents.some((a) => a.origin === origin)) {
      result.skipped.push(bot.name)
      continue
    }
    try {
      await importBot(bot, origin)
      result.agents.push(bot.name)
    } catch (error) {
      console.warn(`[agent-teams] could not import ${bot.name}:`, error)
      result.skipped.push(bot.name)
    }
  }
  return result

  // One bot per call, so a bad value in one stops only that bot.
  async function importBot(bot: MausBot, origin: string): Promise<void> {
    let teamId: string | null = null
    if (bot.section) {
      teamId = teamIdBySection.get(bot.section) ?? null
      if (!teamId) {
        teamId = slugForName(bot.section, takenTeams)
        takenTeams.add(teamId)
        teamIdBySection.set(bot.section, teamId)
        await saveTeam({
          id: teamId,
          name: bot.section,
          description: 'Imported from OpenMausBot',
          instructions: sectionContexts.contexts?.[bot.section] ?? '',
          createdAt: now,
          updatedAt: now
        })
        result.teams.push(bot.section)
      }
    }

    const workspace = join(mausHome(), 'workspaces', bot.id)
    const commands: { name: string; prompt: string }[] = []
    try {
      for (const name of await readdir(join(workspace, 'skills'))) {
        const skill = await readFile(join(workspace, 'skills', name, 'SKILL.md'), 'utf8').catch(
          () => ''
        )
        if (skill && commands.length < 40) {
          commands.push({
            name: name.slice(0, 40),
            prompt: commandPrompt(skill).slice(0, 8000)
          })
        }
      }
    } catch {
      // A bot with no skills folder simply has no commands.
    }

    const id = slugForName(bot.name, takenAgents)
    takenAgents.add(id)
    const engine = bot.modelSelection?.instanceId
    await saveAgent({
      id,
      name: bot.name.slice(0, 60),
      title: (bot.title ?? '').slice(0, 120),
      soul: [bot.description, bot.soul].filter(Boolean).join('\n\n').slice(0, 40_000),
      color: (bot.color ?? 'violet').slice(0, 24),
      agent: engine === 'hermes' || engine === 'codex' ? engine : 'claude',
      model: null,
      folder: bot.cwd ?? null,
      teamId,
      commands,
      // Imported routines are notes only: OpenMausBot (and Orca) already run them; scheduling here would double-run.
      routines: routines
        .filter((r) => r.botId === bot.id)
        .slice(0, 40)
        .map((r) => ({
          name: r.name.slice(0, 80),
          prompt: r.prompt.slice(0, 8000),
          schedule: describeSchedule(r.schedule),
          automationId: null
        })),
      createdBy: 'openmausbot-import',
      origin,
      createdAt: now,
      updatedAt: now
    })

    const memory = await readFile(join(workspace, 'MEMORY.md'), 'utf8').catch(() => '')
    if (memory) {
      await writeMemoryIfUnchanged('agent', id, await readMemory('agent', id), memory)
    }
    const attachment = bot.avatarUrl?.startsWith('/api/attachments/')
      ? join(mausHome(), 'attachments', basename(bot.avatarUrl))
      : null
    if (attachment) {
      await setAgentAvatarFromFile(id, attachment).catch(() => undefined)
    }
  }
}
