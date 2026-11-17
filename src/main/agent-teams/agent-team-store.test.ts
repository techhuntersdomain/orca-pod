import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  deleteAgent,
  deleteTeam,
  prepareAgentLaunch,
  readAgentAvatar,
  readAgentTeamsSnapshot,
  readMemory,
  saveAgent,
  saveTeam,
  setAgentAvatarFromFile,
  writeMemoryIfUnchanged
} from './agent-team-store'
import { importFromOpenMausBot } from './openmausbot-import'

let home: string
let maus: string
const now = 1_700_000_000_000

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'agent-teams-'))
  maus = mkdtempSync(join(tmpdir(), 'openmausbot-'))
  process.env.ORCA_TEAMS_HOME = home
  process.env.OPENMAUSBOT_HOME = maus
})

afterEach(() => {
  delete process.env.ORCA_TEAMS_HOME
  delete process.env.OPENMAUSBOT_HOME
  rmSync(home, { recursive: true, force: true })
  rmSync(maus, { recursive: true, force: true })
})

const writeAgentFile = (id: string, body: unknown): void => {
  mkdirSync(join(home, 'agents', id), { recursive: true })
  writeFileSync(join(home, 'agents', id, 'agent.json'), JSON.stringify(body))
}

describe('agent team store', () => {
  it('saves agents and teams and reads them back with their memory files', async () => {
    await saveTeam({ id: 'content', name: 'Content', createdAt: now, updatedAt: now })
    await saveAgent({ id: 'nova', name: 'Nova', teamId: 'content', createdAt: now, updatedAt: now })
    const snapshot = await readAgentTeamsSnapshot()
    expect(snapshot.agents.map((a) => a.id)).toEqual(['nova'])
    expect(snapshot.teams.map((t) => t.id)).toEqual(['content'])
    expect(await readMemory('team', 'content')).toContain('department memory')
  })

  it('reports a bad agent-written file instead of dropping it silently', async () => {
    writeAgentFile('evil', {
      id: 'evil',
      name: 'Evil',
      avatarFile: '../../x',
      createdAt: 1,
      updatedAt: 1
    })
    writeAgentFile('moved', { id: 'other', name: 'Moved', createdAt: 1, updatedAt: 1 })
    const snapshot = await readAgentTeamsSnapshot()
    expect(snapshot.agents).toEqual([])
    expect(snapshot.rejected.map((r) => r.reason).join(' ')).toMatch(/avatarFile/)
    expect(snapshot.rejected.map((r) => r.reason)).toContain('id does not match its folder name')
  })

  it('keeps the ids agents wrote on disk, even when the team is missing', async () => {
    await saveAgent({ id: 'nova', name: 'Nova', teamId: 'gone', createdAt: now, updatedAt: now })
    const snapshot = await readAgentTeamsSnapshot()
    expect(snapshot.agents[0].teamId).toBe('gone')
  })

  it('refuses a memory save when an agent wrote to the file meanwhile', async () => {
    await saveTeam({ id: 'content', name: 'Content', createdAt: now, updatedAt: now })
    const opened = await readMemory('team', 'content')
    writeFileSync(join(home, 'teams', 'content', 'MEMORY.md'), `${opened}- agent note\n`)
    expect(await writeMemoryIfUnchanged('team', 'content', opened, 'my edit')).toBe(false)
    expect(await readMemory('team', 'content')).toContain('agent note')
    const fresh = await readMemory('team', 'content')
    expect(await writeMemoryIfUnchanged('team', 'content', fresh, 'my edit')).toBe(true)
    expect(await readMemory('team', 'content')).toBe('my edit')
  })

  it('replaces a picture, removing only the old picture file', async () => {
    await saveAgent({ id: 'nova', name: 'Nova', createdAt: now, updatedAt: now })
    const png = join(maus, 'face.png')
    writeFileSync(png, 'png-bytes')
    const first = await setAgentAvatarFromFile('nova', png)
    const second = await setAgentAvatarFromFile('nova', png)
    expect(second.avatarFile).not.toBe(first.avatarFile)
    expect(existsSync(join(home, 'agents', 'nova', first.avatarFile!))).toBe(false)
    expect((await readAgentAvatar('nova'))?.mimeType).toBe('image/png')
    await expect(setAgentAvatarFromFile('nova', join(maus, 'notes.txt'))).rejects.toThrow()
  })

  it('writes a fresh brief at every start and tells the agent where it is', async () => {
    await saveTeam({
      id: 'content',
      name: 'Content',
      instructions: 'No posting.',
      createdAt: now,
      updatedAt: now
    })
    await saveAgent({ id: 'nova', name: 'Nova', teamId: 'content', createdAt: now, updatedAt: now })
    const launch = await prepareAgentLaunch('nova', 'draft one post')
    expect(readFileSync(launch.briefPath, 'utf8')).toContain('No posting.')
    expect(launch.teamDir).toBe(join(home, 'teams', 'content'))
    expect(launch.firstMessage).toContain('Task: draft one post')
  })

  it('deletes a team but keeps its agents, and deletes an agent folder', async () => {
    await saveTeam({ id: 'content', name: 'Content', createdAt: now, updatedAt: now })
    await saveAgent({ id: 'nova', name: 'Nova', teamId: 'content', createdAt: now, updatedAt: now })
    await deleteTeam('content')
    expect((await readAgentTeamsSnapshot()).agents).toHaveLength(1)
    await deleteAgent('nova')
    expect(existsSync(join(home, 'agents', 'nova'))).toBe(false)
    await expect(deleteAgent('../escape')).rejects.toThrow(/Unsafe/)
  })
})

describe('OpenMausBot import', () => {
  const writeMaus = (file: string, body: unknown): void => {
    mkdirSync(join(maus, file, '..'), { recursive: true })
    writeFileSync(join(maus, file), typeof body === 'string' ? body : JSON.stringify(body))
  }

  it('imports bots once, with team, commands, memory and unscheduled routines', async () => {
    writeMaus('bots.json', [
      { id: 'b1', name: 'Frisky', section: 'Studio', cwd: '/work' },
      { id: '../bad', name: 'Bad' },
      { id: 'b3', name: 'Loud', color: 'x'.repeat(60) }
    ])
    writeMaus('routines.json', {
      routines: [
        {
          name: 'Morning',
          prompt: 'brief',
          botId: 'b1',
          schedule: { type: 'daily', time: '08:00' }
        }
      ]
    })
    writeMaus('workspaces/b1/skills/status/SKILL.md', '---\nname: status\n---\n# /status\nReport.')
    writeMaus('workspaces/b1/MEMORY.md', 'remembers things')

    const first = await importFromOpenMausBot()
    expect(first).toEqual({ agents: ['Frisky', 'Loud'], teams: ['Studio'], skipped: ['Bad'] })
    const frisky = (await readAgentTeamsSnapshot()).agents.find((a) => a.name === 'Frisky')!
    expect(frisky).toMatchObject({ teamId: 'studio', folder: '/work', origin: 'openmausbot:b1' })
    expect(frisky.commands).toEqual([{ name: 'status', prompt: 'Report.' }])
    expect(frisky.routines[0]).toMatchObject({ schedule: 'daily at 08:00', automationId: null })
    expect(await readMemory('agent', frisky.id)).toBe('remembers things')

    const again = await importFromOpenMausBot()
    expect(again.agents).toEqual([])
    expect((await readAgentTeamsSnapshot()).agents).toHaveLength(2)
  })
})
