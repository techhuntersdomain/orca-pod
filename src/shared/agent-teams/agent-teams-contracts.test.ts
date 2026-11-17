import { describe, expect, it } from 'vitest'
import { agentFirstMessage, agentLaunchArgs, composeAgentBrief } from './agent-brief'
import { resolveAgentLinks } from './agent-links'
import { AgentProfileSchema, AgentTeamSchema, slugForName } from './agent-team-types'

const base = { createdAt: 1, updatedAt: 1 }
const agent = (fields: Record<string, unknown>) =>
  AgentProfileSchema.parse({ id: 'nova', name: 'Nova', ...base, ...fields })
const team = (fields: Record<string, unknown>) =>
  AgentTeamSchema.parse({ id: 'content', name: 'Content', ...base, ...fields })

describe('agent profile schema', () => {
  it('fills defaults for a minimal file', () => {
    expect(agent({})).toMatchObject({ agent: 'claude', avatarFile: null, teamId: null })
  })

  it('rejects a picture name that could point outside the agent folder', () => {
    for (const avatarFile of ['../../.zshrc', 'avatar-1.png/../x', 'notes.md', 'avatar-.png']) {
      expect(() => agent({ avatarFile })).toThrow()
    }
    expect(agent({ avatarFile: 'avatar-1794887260864.jpg' }).avatarFile).toBe(
      'avatar-1794887260864.jpg'
    )
  })

  it('rejects a model or engine that carries a second CLI flag', () => {
    expect(() => agent({ model: 'opus --dangerously-skip-permissions' })).toThrow()
    expect(() => agent({ agent: 'claude --yolo' })).toThrow()
    expect(agent({ model: 'claude-opus-5-5[1m]' }).model).toBe('claude-opus-5-5[1m]')
  })

  it('rejects ids that are not folder-safe', () => {
    expect(() => agent({ id: '../evil' })).toThrow()
    expect(() => agent({ teamId: 'Has Spaces' })).toThrow()
  })
})

describe('launch arguments', () => {
  it('quotes every path so a home folder with spaces stays one argument', () => {
    const args = agentLaunchArgs(agent({ model: 'opus' }), '/Users/Jo Smith/.orca-teams/b.md', [
      '/Users/Jo Smith/.orca-teams/agents/nova'
    ])
    expect(args).toBe(
      "--append-system-prompt-file '/Users/Jo Smith/.orca-teams/b.md' --add-dir '/Users/Jo Smith/.orca-teams/agents/nova' --model 'opus'"
    )
  })

  it('passes only a model to Codex and nothing to other engines', () => {
    expect(agentLaunchArgs(agent({ agent: 'codex', model: 'gpt-5' }), '/b', [])).toBe("-m 'gpt-5'")
    expect(agentLaunchArgs(agent({ agent: 'codex' }), '/b', [])).toBeNull()
    expect(agentLaunchArgs(agent({ agent: 'hermes', model: 'x' }), '/b', [])).toBeNull()
  })

  it('tells every engine where its brief is, with the task when given', () => {
    expect(agentFirstMessage(agent({}), '/b.md')).toContain('/b.md')
    expect(agentFirstMessage(agent({}), '/b.md', ' ship it ')).toMatch(/Task: ship it$/)
  })
})

describe('brief', () => {
  it('carries the soul, the team rules, teammates and how to hire a sub-agent', () => {
    const lead = agent({ soul: 'Be kind.', teamId: 'content' })
    const mate = agent({ id: 'ivy', name: 'Ivy', title: 'Editor', teamId: 'content' })
    const brief = composeAgentBrief(lead, team({ instructions: 'No posting.' }), [lead, mate], {
      home: '/h',
      agentDir: '/h/agents/nova',
      teamDir: '/h/teams/content'
    })
    expect(brief).toContain('Be kind.')
    expect(brief).toContain('No posting.')
    expect(brief).toContain('Ivy')
    expect(brief).toContain('/h/teams/content')
    expect(brief).toContain('agent.json')
    expect(brief).not.toMatch(/\n\n\n/)
  })
})

describe('display links', () => {
  it('reads a missing team or parent as none without touching valid links', () => {
    const kept = agent({ id: 'a', teamId: 'content' })
    const [a, b] = resolveAgentLinks(
      [kept, agent({ id: 'b', teamId: 'gone', parentId: 'ghost' })],
      [team({})]
    )
    expect(a).toBe(kept)
    expect(b).toMatchObject({ teamId: null, parentId: null })
  })

  it('cuts a hiring loop so every agent still shows', () => {
    const resolved = resolveAgentLinks(
      [
        agent({ id: 'a', parentId: 'b' }),
        agent({ id: 'b', parentId: 'a' }),
        agent({ id: 'c', parentId: 'c' }),
        agent({ id: 'd', parentId: 'a' })
      ],
      []
    )
    expect(resolved.map((r) => r.parentId)).toEqual([null, null, null, 'a'])
  })
})

describe('slugForName', () => {
  it('makes a folder-safe id and avoids taken ones', () => {
    expect(slugForName('Frisky Rissellio!', new Set())).toBe('frisky-rissellio')
    expect(slugForName('Nova', new Set(['nova', 'nova-2']))).toBe('nova-3')
    expect(slugForName('???', new Set())).toBe('agent')
  })
})
