import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store/index'
import { activateAndRevealWorktree } from '@/lib/workspace/activation/worktree-activation'
import { launchAgentInNewTabWithOutcome } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'
import { isTuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent-config'
import { agentLaunchArgs } from '../../../../shared/agent-teams/agent-brief'
import type { AgentProfile } from '../../../../shared/agent-teams/agent-team-types'
import { recordAgentLaunch } from './use-agent-teams'
import { createNonSecureContextUuid } from '../../../../shared/non-secure-context-uuid'
import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'

function sameFolder(a: string, b: string): boolean {
  return normalizeRuntimePathForComparison(a) === normalizeRuntimePathForComparison(b)
}

/** The agent's own folder when Orca has it open as a workspace, else the workspace in front. */
export function workspaceForAgent(
  agent: AgentProfile
): { id: string; label: string; remote: boolean } | null {
  const state = useAppStore.getState()
  const all = state.allWorktrees()
  if (agent.folder) {
    const own = all.find((w) => sameFolder(w.path, agent.folder!))
    if (own) {
      return { id: own.id, label: own.displayName || own.path, remote: isRemote(own.hostId) }
    }
  }
  const active = state.activeWorktreeId ? all.find((w) => w.id === state.activeWorktreeId) : null
  return active
    ? { id: active.id, label: active.displayName || active.path, remote: isRemote(active.hostId) }
    : null
}

function isRemote(hostId: string | undefined): boolean {
  return hostId !== undefined && hostId !== LOCAL_EXECUTION_HOST_ID
}

export async function startAgentProfile(agent: AgentProfile, task?: string): Promise<boolean> {
  const workspace = workspaceForAgent(agent)
  if (!workspace) {
    toast.error(
      translate(
        'agentTeams.launch.noWorkspace',
        'Open a project or folder first, then start {{name}}.',
        { name: agent.name }
      ),
      {
        description: agent.folder
          ? translate(
              'agentTeams.launch.noWorkspaceFolder',
              '{{name}} works in {{folder}}. Add that folder in the sidebar to start there.',
              { name: agent.name, folder: agent.folder }
            )
          : translate(
              'agentTeams.launch.noWorkspaceDefault',
              'Agents start in the workspace you have open.'
            )
      }
    )
    return false
  }
  if (workspace.remote) {
    // The brief and memory files live on this computer, where a remote host cannot read them.
    toast.error(
      translate(
        'agentTeams.launch.remoteWorkspace',
        '{{name}} can only start in a workspace on this computer.',
        { name: agent.name }
      ),
      {
        description: translate(
          'agentTeams.launch.remoteWorkspaceDescription',
          '{{workspace}} runs on another machine. Open a local folder first.',
          { workspace: workspace.label }
        )
      }
    )
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
  // Show the workspace the agent started in; Orca only spawns a tab once its workspace is on screen.
  activateAndRevealWorktree(workspace.id, { sidebarRevealBehavior: 'auto' })
  return true
}
