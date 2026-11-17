import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { slugForName } from '../../shared/agent-teams/agent-team-types'
import {
  readAgentTeamsSnapshot,
  saveAgent,
  saveTeam,
  setAgentAvatarFromFile,
  writeMemory
} from './agent-team-store'

type MausBot = {
  id: string
  name: string
  title?: string
  description?: string
  soul?: string
  color?: string
  section?: string
  avatarUrl?: string
  cwd?: string
  modelSelection?: { instanceId?: string; model?: string }
}

type MausRoutine = {
  name: string
  prompt: string
  botId?: string
  schedule?: { type?: string; time?: string; everyMinutes?: number; weekdays?: number[] }
}

export type OpenMausBotImportResult = {
  agents: string[]
  teams: string[]
  skipped: string[]
}

const MAUS_HOME = join(homedir(), '.openmausbot')

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return fallback
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
  const bots = await readJson<MausBot[]>(join(MAUS_HOME, 'bots.json'), [])
  const routines =
    (await readJson<{ routines?: MausRoutine[] }>(join(MAUS_HOME, 'routines.json'), {})).routines ??
    []
  const sectionContexts = await readJson<{ contexts?: Record<string, string> }>(
    join(MAUS_HOME, 'section-contexts.json'),
    {}
  )
  const snapshot = await readAgentTeamsSnapshot()
  const result: OpenMausBotImportResult = { agents: [], teams: [], skipped: [] }
  const takenAgents = new Set(snapshot.agents.map((a) => a.id))
  const takenTeams = new Set(snapshot.teams.map((t) => t.id))
  const teamIdBySection = new Map(snapshot.teams.map((t) => [t.name, t.id]))
  const now = Date.now()

  for (const bot of bots) {
    const origin = `openmausbot:${bot.id}`
    if (snapshot.agents.some((a) => a.origin === origin)) {
      result.skipped.push(bot.name)
      continue
    }
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

    const workspace = join(MAUS_HOME, 'workspaces', bot.id)
    const commands: { name: string; prompt: string }[] = []
    try {
      for (const name of await readdir(join(workspace, 'skills'))) {
        const skill = await readFile(join(workspace, 'skills', name, 'SKILL.md'), 'utf8').catch(
          () => ''
        )
        if (skill) {
          commands.push({ name, prompt: commandPrompt(skill).slice(0, 8000) })
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
      color: bot.color ?? 'violet',
      agent: engine === 'hermes' || engine === 'codex' ? engine : 'claude',
      model: null,
      folder: bot.cwd ?? null,
      teamId,
      commands,
      // Imported routines are notes only: OpenMausBot (and Orca) already run them; scheduling here would double-run.
      routines: routines
        .filter((r) => r.botId === bot.id)
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
      await writeMemory('agent', id, memory)
    }
    const attachment = bot.avatarUrl?.startsWith('/api/attachments/')
      ? join(MAUS_HOME, 'attachments', basename(bot.avatarUrl))
      : null
    if (attachment) {
      await setAgentAvatarFromFile(id, attachment).catch(() => undefined)
    }
    result.agents.push(bot.name)
  }
  return result
}
