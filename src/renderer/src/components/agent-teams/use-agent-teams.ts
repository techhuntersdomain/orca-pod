import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { AgentTeamsSnapshot } from '../../../../shared/agent-teams/agent-team-types'
import { resolveAgentLinks } from '../../../../shared/agent-teams/agent-links'

const EMPTY: AgentTeamsSnapshot = {
  agents: [],
  teams: [],
  rejected: [],
  home: ''
}

export function useAgentTeamsSnapshot(): {
  snapshot: AgentTeamsSnapshot
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
} {
  const [snapshot, setSnapshot] = useState<AgentTeamsSnapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    try {
      const next = await window.api.agentTeams.snapshot()
      setSnapshot({
        ...next,
        agents: resolveAgentLinks(next.agents, next.teams)
      })
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void refresh()
    return window.api.agentTeams.onChanged(() => void refresh())
  }, [refresh])
  return { snapshot, loading, error, refresh }
}

/** Object URLs for profile pictures, refreshed when an agent's avatar file changes. */
export function useAgentAvatarUrl(agentId: string, avatarFile: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const current = useRef<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!avatarFile) {
      if (current.current) {
        URL.revokeObjectURL(current.current)
        current.current = null
      }
      setUrl(null)
      return
    }
    void window.api.agentTeams.readAvatar(agentId).then((avatar) => {
      if (cancelled || !avatar) {
        return
      }
      const next = URL.createObjectURL(new Blob([avatar.bytes], { type: avatar.mimeType }))
      if (current.current) {
        URL.revokeObjectURL(current.current)
      }
      current.current = next
      setUrl(next)
    })
    return () => {
      cancelled = true
    }
  }, [agentId, avatarFile])
  useEffect(
    () => () => {
      if (current.current) {
        URL.revokeObjectURL(current.current)
      }
    },
    []
  )
  return url
}

/** Which terminal tab each started agent lives in, for this window's session. */
type LaunchedTabs = Readonly<
  Record<string, { tabId: string; worktreeId: string; startedAt: number }>
>
let launchedTabs: LaunchedTabs = {}
const listeners = new Set<() => void>()

export function recordAgentLaunch(agentId: string, tabId: string, worktreeId: string): void {
  launchedTabs = {
    ...launchedTabs,
    [agentId]: { tabId, worktreeId, startedAt: Date.now() }
  }
  for (const listener of listeners) {
    listener()
  }
}

export function useLaunchedAgentTabs(): LaunchedTabs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => launchedTabs
  )
}
