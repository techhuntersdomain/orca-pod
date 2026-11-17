import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../../api-types'

export const agentTeamsApi = {
  snapshot: () => ipcRenderer.invoke('agentTeams:snapshot'),
  saveAgent: (agent) => ipcRenderer.invoke('agentTeams:saveAgent', agent),
  saveTeam: (team) => ipcRenderer.invoke('agentTeams:saveTeam', team),
  deleteAgent: (id) => ipcRenderer.invoke('agentTeams:deleteAgent', id),
  deleteTeam: (id) => ipcRenderer.invoke('agentTeams:deleteTeam', id),
  readAvatar: (id) => ipcRenderer.invoke('agentTeams:readAvatar', id),
  pickAvatar: (id) => ipcRenderer.invoke('agentTeams:pickAvatar', id),
  readMemory: (kind, id) => ipcRenderer.invoke('agentTeams:readMemory', kind, id),
  writeMemory: (kind, id, expected, text) =>
    ipcRenderer.invoke('agentTeams:writeMemory', kind, id, expected, text),
  prepareLaunch: (id, task) => ipcRenderer.invoke('agentTeams:prepareLaunch', id, task),
  importOpenMausBot: () => ipcRenderer.invoke('agentTeams:importOpenMausBot'),
  revealHome: () => ipcRenderer.invoke('agentTeams:revealHome'),
  onChanged: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on('agentTeams:changed', listener)
    return () => {
      ipcRenderer.removeListener('agentTeams:changed', listener)
    }
  }
} satisfies PreloadApi['agentTeams']
