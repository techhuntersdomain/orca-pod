import { type FSWatcher, watch } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile, copyFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'
import { z } from 'zod'
import { APP_FLAVOR } from '../../shared/app-flavor'
import {
  writeFileAtomically,
  writeFileAtomicallyIfUnchanged
} from '../filesystem/atomic-file-publication'
import {
  AVATAR_FILE_PATTERN,
  AgentProfileSchema,
  AgentTeamSchema,
  type AgentLaunchBrief,
  type AgentProfile,
  type AgentTeam,
  type AgentTeamsSnapshot
} from '../../shared/agent-teams/agent-team-types'
import { agentFirstMessage, composeAgentBrief } from '../../shared/agent-teams/agent-brief'

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const AVATAR_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}
const AVATAR_MAX_BYTES = 8 * 1024 * 1024

/** ORCA_TEAMS_HOME points tests (or a second setup) at another folder. */
export function agentTeamsHome(): string {
  return process.env.ORCA_TEAMS_HOME || join(homedir(), APP_FLAVOR.agentHomeDirName)
}

function agentDir(id: string): string {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Unsafe agent id: ${id}`)
  }
  return join(agentTeamsHome(), 'agents', id)
}

function teamDir(id: string): string {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Unsafe team id: ${id}`)
  }
  return join(agentTeamsHome(), 'teams', id)
}

async function readEntries<T extends { id: string }>(
  kind: 'agents' | 'teams',
  fileName: string,
  parse: (raw: unknown) => T,
  rejected: AgentTeamsSnapshot['rejected']
): Promise<T[]> {
  const root = join(agentTeamsHome(), kind)
  let names: string[]
  try {
    names = await readdir(root)
  } catch {
    return []
  }
  const out: T[] = []
  for (const name of names) {
    if (!SAFE_ID.test(name)) {
      continue
    }
    const path = join(root, name, fileName)
    try {
      const parsed = parse(JSON.parse(await readFile(path, 'utf8')))
      if (parsed.id !== name) {
        rejected.push({ path, reason: 'id does not match its folder name' })
        continue
      }
      out.push(parsed)
    } catch (error) {
      if (isMissingFile(error)) {
        continue
      }
      const reason =
        error instanceof z.ZodError
          ? error.issues.map((i) => `${i.path.join('.') || 'file'}: ${i.message}`).join('; ')
          : error instanceof Error
            ? error.message
            : 'unreadable'
      rejected.push({ path, reason: reason.slice(0, 300) })
    }
  }
  return out
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function fieldsOf(input: unknown): object {
  return typeof input === 'object' && input !== null ? input : {}
}

export async function readAgentTeamsSnapshot(): Promise<AgentTeamsSnapshot> {
  const rejected: AgentTeamsSnapshot['rejected'] = []
  const [agents, teams] = await Promise.all([
    readEntries('agents', 'agent.json', (raw) => AgentProfileSchema.parse(raw), rejected),
    readEntries('teams', 'team.json', (raw) => AgentTeamSchema.parse(raw), rejected)
  ])
  agents.sort((a, b) => a.createdAt - b.createdAt)
  teams.sort((a, b) => a.createdAt - b.createdAt)
  return { agents, teams, rejected, home: agentTeamsHome() }
}

async function ensureMemoryFile(dir: string, heading: string): Promise<void> {
  // 'wx' never replaces a memory file an agent created a moment ago.
  await writeFile(join(dir, 'MEMORY.md'), `# ${heading}\n\n`, {
    flag: 'wx'
  }).catch(() => undefined)
}

export async function saveAgent(input: unknown): Promise<AgentProfile> {
  const agent = AgentProfileSchema.parse({
    ...fieldsOf(input),
    updatedAt: Date.now()
  })
  const dir = agentDir(agent.id)
  await mkdir(dir, { recursive: true })
  writeFileAtomically(join(dir, 'agent.json'), `${JSON.stringify(agent, null, 2)}\n`)
  await ensureMemoryFile(dir, `${agent.name} — memory`)
  return agent
}

export async function saveTeam(input: unknown): Promise<AgentTeam> {
  const team = AgentTeamSchema.parse({
    ...fieldsOf(input),
    updatedAt: Date.now()
  })
  const dir = teamDir(team.id)
  await mkdir(dir, { recursive: true })
  writeFileAtomically(join(dir, 'team.json'), `${JSON.stringify(team, null, 2)}\n`)
  await ensureMemoryFile(dir, `${team.name} — department memory`)
  return team
}

export async function deleteAgent(id: string): Promise<void> {
  await rm(agentDir(id), { recursive: true, force: true })
}

/** A team's members stay; they simply become unassigned on the next read. */
export async function deleteTeam(id: string): Promise<void> {
  await rm(teamDir(id), { recursive: true, force: true })
}

export async function readMemory(kind: 'agent' | 'team', id: string): Promise<string> {
  const dir = kind === 'agent' ? agentDir(id) : teamDir(id)
  try {
    return await readFile(join(dir, 'MEMORY.md'), 'utf8')
  } catch {
    return ''
  }
}

/** Agents append to memory while a person edits it; refuse rather than overwrite what they added meanwhile. */
export async function writeMemoryIfUnchanged(
  kind: 'agent' | 'team',
  id: string,
  expected: string,
  text: string
): Promise<boolean> {
  const dir = kind === 'agent' ? agentDir(id) : teamDir(id)
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'MEMORY.md')
  const exists = await stat(path).then(
    () => true,
    () => false
  )
  return writeFileAtomicallyIfUnchanged(path, exists || expected !== '' ? expected : null, text)
}

export async function setAgentAvatarFromFile(id: string, source: string): Promise<AgentProfile> {
  const ext = extname(source).toLowerCase()
  if (!AVATAR_TYPES[ext]) {
    throw new Error('Pick a PNG, JPEG, GIF or WebP image.')
  }
  const info = await stat(source)
  if (!info.isFile() || info.size > AVATAR_MAX_BYTES) {
    throw new Error('The picture must be a file under 8 MB.')
  }
  let agent: AgentProfile
  try {
    agent = AgentProfileSchema.parse(
      JSON.parse(await readFile(join(agentDir(id), 'agent.json'), 'utf8'))
    )
  } catch {
    throw new Error('That agent no longer exists.')
  }
  const fileName = `avatar-${Date.now()}${ext === '.jpeg' ? '.jpg' : ext}`
  await copyFile(source, join(agentDir(id), fileName))
  if (
    agent.avatarFile &&
    agent.avatarFile !== fileName &&
    AVATAR_FILE_PATTERN.test(agent.avatarFile)
  ) {
    await rm(join(agentDir(id), agent.avatarFile), { force: true })
  }
  return saveAgent({ ...agent, avatarFile: fileName })
}

export async function readAgentAvatar(
  id: string
): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  const snapshot = await readAgentTeamsSnapshot()
  const file = snapshot.agents.find((a) => a.id === id)?.avatarFile
  if (!file || !AVATAR_FILE_PATTERN.test(file)) {
    return null
  }
  const mimeType = AVATAR_TYPES[extname(file).toLowerCase()]
  if (!mimeType) {
    return null
  }
  try {
    const buffer = await readFile(join(agentDir(id), file))
    return {
      bytes: new Uint8Array(buffer).buffer,
      mimeType
    }
  } catch {
    return null
  }
}

/** Writes BRIEF.md fresh at every start, so edits to the soul or team rules apply on the next launch. */
export async function prepareAgentLaunch(id: string, task?: string): Promise<AgentLaunchBrief> {
  const snapshot = await readAgentTeamsSnapshot()
  const agent = snapshot.agents.find((a) => a.id === id)
  if (!agent) {
    throw new Error('That agent no longer exists.')
  }
  const team = agent.teamId ? (snapshot.teams.find((t) => t.id === agent.teamId) ?? null) : null
  const dir = agentDir(agent.id)
  const tDir = team ? teamDir(team.id) : null
  await mkdir(dir, { recursive: true })
  await ensureMemoryFile(dir, `${agent.name} — memory`)
  if (tDir && team) {
    await mkdir(tDir, { recursive: true })
    await ensureMemoryFile(tDir, `${team.name} — department memory`)
  }
  const teammates = team ? snapshot.agents.filter((a) => a.teamId === team.id) : []
  const brief = composeAgentBrief(agent, team, teammates, {
    home: agentTeamsHome(),
    agentDir: dir,
    teamDir: tDir
  })
  const briefPath = join(dir, 'BRIEF.md')
  await writeFile(briefPath, brief, 'utf8')
  return {
    briefPath,
    agentDir: dir,
    teamDir: tDir,
    firstMessage: agentFirstMessage(agent, briefPath, task)
  }
}

let watcher: FSWatcher | null = null
let debounce: NodeJS.Timeout | null = null

export async function watchAgentTeams(onChange: () => void): Promise<void> {
  if (watcher) {
    return
  }
  await mkdir(join(agentTeamsHome(), 'agents'), { recursive: true })
  await mkdir(join(agentTeamsHome(), 'teams'), { recursive: true })
  watcher = watch(agentTeamsHome(), { recursive: true }, (_event, file) => {
    if (file && /(^|[\\/])(BRIEF|MEMORY)\.md$/.test(String(file))) {
      return
    }
    if (debounce) {
      clearTimeout(debounce)
    }
    debounce = setTimeout(onChange, 300)
  })
  watcher.on('error', (error) => {
    console.warn('[agent-teams] folder watch stopped, restarting:', error)
    watcher?.close()
    watcher = null
    setTimeout(() => void watchAgentTeams(onChange).catch(() => undefined), 5000)
  })
}
