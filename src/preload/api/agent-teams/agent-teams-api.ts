import type {
  AgentLaunchBrief,
  AgentProfile,
  AgentTeam,
  AgentTeamsSnapshot
} from '../../../shared/agent-teams/agent-team-types'

export type AgentTeamsApi = {
  snapshot: () => Promise<AgentTeamsSnapshot>
  saveAgent: (agent: AgentProfile) => Promise<AgentProfile>
  saveTeam: (team: AgentTeam) => Promise<AgentTeam>
  deleteAgent: (id: string) => Promise<void>
  deleteTeam: (id: string) => Promise<void>
  readAvatar: (id: string) => Promise<{ bytes: ArrayBuffer; mimeType: string } | null>
  pickAvatar: (id: string) => Promise<AgentProfile | null>
  readMemory: (kind: 'agent' | 'team', id: string) => Promise<string>
  writeMemory: (kind: 'agent' | 'team', id: string, text: string) => Promise<void>
  prepareLaunch: (id: string, task?: string) => Promise<AgentLaunchBrief>
  importOpenMausBot: () => Promise<{ agents: string[]; teams: string[]; skipped: string[] }>
  revealHome: () => Promise<string>
  onChanged: (callback: () => void) => () => void
}
