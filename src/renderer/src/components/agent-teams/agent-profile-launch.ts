import { toast } from 'sonner'
import { useAppStore } from '@/store/index'
import { launchAgentInNewTabWithOutcome } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'
import { isTuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent-config'
import { agentLaunchArgs } from '../../../../shared/agent-teams/agent-brief'
import type { AgentProfile } from '../../../../shared/agent-teams/agent-team-types'
import { recordAgentLaunch } from './use-agent-teams'
import { createNonSecureContextUuid } from '../../../../shared/non-secure-context-uuid'

function sameFolder(a: string, b: string): boolean {
  return a.replace(/\/+$/, '') === b.replace(/\/+$/, '')
}

/** The agent's own folder when Orca has it open as a workspace, else the workspace in front. */
export function workspaceForAgent(agent: AgentProfile): { id: string; label: string } | null {
  const state = useAppStore.getState()
  const all = state.allWorktrees()
  if (agent.folder) {
    const own = all.find((w) => sameFolder(w.path, agent.folder!))
    if (own) {
      return { id: own.id, label: own.displayName || own.path }
    }
  }
  const active = state.activeWorktreeId ? all.find((w) => w.id === state.activeWorktreeId) : null
  return active ? { id: active.id, label: active.displayName || active.path } : null
}

export async function startAgentProfile(agent: AgentProfile, task?: string): Promise<boolean> {
  const workspace = workspaceForAgent(agent)
  if (!workspace) {
    toast.error(`Open a project or folder first, then start ${agent.name}.`, {
      description: agent.folder
        ? `${agent.name} works in ${agent.folder}. Add that folder in the sidebar to start there.`
        : 'Agents start in the workspace you have open.'
    })
    return false
  }
  const brief = await window.api.agentTeams.prepareLaunch(agent.id, task)
  const dirs = [brief.agentDir, ...(brief.teamDir ? [brief.teamDir] : [])]
  const outcome = launchAgentInNewTabWithOutcome({
    requestId: createNonSecureContextUuid(),
    agent: isTuiAgent(agent.agent) ? agent.agent : 'claude',
    worktreeId: workspace.id,
    prompt: brief.firstMessage,
    agentArgs: agentLaunchArgs(agent, brief.briefPath, dirs),
    promptDelivery: 'submit-after-ready',
    quickCommandLabel: agent.name
  })
  if (!outcome || 'refused' in outcome) {
    return false
  }
  if (outcome.surface.kind !== 'host-published') {
    recordAgentLaunch(agent.id, outcome.surface.tabId, workspace.id)
  }
  useAppStore.getState().closeAgentsPage()
  return true
}
