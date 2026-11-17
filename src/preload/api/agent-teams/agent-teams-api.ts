import type {
  AgentLaunchBrief,
  AgentProfile,
  AgentTeam,
  AgentTeamsSnapshot,
  OpenMausBotImportResult
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
  /** False when the file changed since `expected` was read; nothing is written then. */
  writeMemory: (
    kind: 'agent' | 'team',
    id: string,
    expected: string,
    text: string
  ) => Promise<boolean>
  prepareLaunch: (id: string, task?: string) => Promise<AgentLaunchBrief>
  importOpenMausBot: () => Promise<OpenMausBotImportResult>
  revealHome: () => Promise<string>
  onChanged: (callback: () => void) => () => void
}
