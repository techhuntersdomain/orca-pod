import { type FSWatcher, watch } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile, copyFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'
import { APP_FLAVOR } from '../../shared/app-flavor'
import {
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

export function agentTeamsHome(): string {
  return join(homedir(), APP_FLAVOR.agentHomeDirName)
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

async function readEntries<T>(
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
      if ((parsed as { id: string }).id !== name) {
        rejected.push({ path, reason: 'id does not match its folder name' })
        continue
      }
      out.push(parsed)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue
      }
      const issues = (error as { issues?: { path: PropertyKey[]; message: string }[] }).issues
      const reason = issues
        ? issues.map((i) => `${i.path.join('.') || 'file'}: ${i.message}`).join('; ')
        : error instanceof Error
          ? error.message
          : 'unreadable'
      rejected.push({ path, reason: reason.slice(0, 300) })
    }
  }
  return out
}

export async function readAgentTeamsSnapshot(): Promise<AgentTeamsSnapshot> {
  const rejected: AgentTeamsSnapshot['rejected'] = []
  const [agents, teams] = await Promise.all([
    readEntries('agents', 'agent.json', (raw) => AgentProfileSchema.parse(raw), rejected),
    readEntries('teams', 'team.json', (raw) => AgentTeamSchema.parse(raw), rejected)
  ])
  const teamIds = new Set(teams.map((t) => t.id))
  const agentIds = new Set(agents.map((a) => a.id))
  for (const agent of agents) {
    if (agent.teamId && !teamIds.has(agent.teamId)) {
      agent.teamId = null
    }
    if (agent.parentId && (!agentIds.has(agent.parentId) || agent.parentId === agent.id)) {
      agent.parentId = null
    }
  }
  agents.sort((a, b) => a.createdAt - b.createdAt)
  teams.sort((a, b) => a.createdAt - b.createdAt)
  return { agents, teams, rejected, home: agentTeamsHome() }
}

async function ensureMemoryFile(dir: string, heading: string): Promise<void> {
  const path = join(dir, 'MEMORY.md')
  try {
    await stat(path)
  } catch {
    await writeFile(path, `# ${heading}\n\n`, 'utf8')
  }
}

export async function saveAgent(input: unknown): Promise<AgentProfile> {
  const agent = AgentProfileSchema.parse({ ...(input as object), updatedAt: Date.now() })
  const dir = agentDir(agent.id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'agent.json'), `${JSON.stringify(agent, null, 2)}\n`, 'utf8')
  await ensureMemoryFile(dir, `${agent.name} — memory`)
  return agent
}

export async function saveTeam(input: unknown): Promise<AgentTeam> {
  const team = AgentTeamSchema.parse({ ...(input as object), updatedAt: Date.now() })
  const dir = teamDir(team.id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'team.json'), `${JSON.stringify(team, null, 2)}\n`, 'utf8')
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

export async function writeMemory(kind: 'agent' | 'team', id: string, text: string): Promise<void> {
  const dir = kind === 'agent' ? agentDir(id) : teamDir(id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'MEMORY.md'), text, 'utf8')
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
  const snapshot = await readAgentTeamsSnapshot()
  const agent = snapshot.agents.find((a) => a.id === id)
  if (!agent) {
    throw new Error('That agent no longer exists.')
  }
  const fileName = `avatar-${Date.now()}${ext}`
  await copyFile(source, join(agentDir(id), fileName))
  if (agent.avatarFile && agent.avatarFile !== fileName) {
    await rm(join(agentDir(id), agent.avatarFile), { force: true })
  }
  return saveAgent({ ...agent, avatarFile: fileName })
}

export async function readAgentAvatar(
  id: string
): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  const snapshot = await readAgentTeamsSnapshot()
  const file = snapshot.agents.find((a) => a.id === id)?.avatarFile
  if (!file || file.includes('/') || file.includes('..')) {
    return null
  }
  const mimeType = AVATAR_TYPES[extname(file).toLowerCase()]
  if (!mimeType) {
    return null
  }
  try {
    const buffer = await readFile(join(agentDir(id), file))
    return {
      bytes: buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ) as ArrayBuffer,
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
    if (file && /(^|\/)(BRIEF|MEMORY)\.md$/.test(String(file))) {
      return
    }
    if (debounce) {
      clearTimeout(debounce)
    }
    debounce = setTimeout(onChange, 300)
  })
  watcher.on('error', () => {
    watcher?.close()
    watcher = null
  })
}
