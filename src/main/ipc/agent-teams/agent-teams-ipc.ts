import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { z } from 'zod'
import {
  agentTeamsHome,
  deleteAgent,
  deleteTeam,
  prepareAgentLaunch,
  readAgentAvatar,
  readAgentTeamsSnapshot,
  readMemory,
  saveAgent,
  saveTeam,
  setAgentAvatarFromFile,
  watchAgentTeams,
  writeMemory
} from '../../agent-teams/agent-team-store'
import { importFromOpenMausBot } from '../../agent-teams/openmausbot-import'

export const AGENT_TEAMS_CHANGED_CHANNEL = 'agentTeams:changed'
const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
const MemoryKindSchema = z.enum(['agent', 'team'])

function broadcastChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(AGENT_TEAMS_CHANGED_CHANNEL)
    }
  }
}

export function registerAgentTeamsHandlers(): void {
  void watchAgentTeams(broadcastChanged).catch((error) => {
    console.warn('[agent-teams] folder watch unavailable:', error)
  })
  ipcMain.handle('agentTeams:snapshot', () => readAgentTeamsSnapshot())
  ipcMain.handle('agentTeams:saveAgent', (_event, input: unknown) => saveAgent(input))
  ipcMain.handle('agentTeams:saveTeam', (_event, input: unknown) => saveTeam(input))
  ipcMain.handle('agentTeams:deleteAgent', (_event, id: unknown) => deleteAgent(IdSchema.parse(id)))
  ipcMain.handle('agentTeams:deleteTeam', (_event, id: unknown) => deleteTeam(IdSchema.parse(id)))
  ipcMain.handle('agentTeams:readAvatar', (_event, id: unknown) =>
    readAgentAvatar(IdSchema.parse(id))
  )
  ipcMain.handle('agentTeams:pickAvatar', async (event, id: unknown) => {
    const agentId = IdSchema.parse(id)
    const window = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Pick a profile picture',
      properties: ['openFile'],
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    }
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) {
      return null
    }
    return setAgentAvatarFromFile(agentId, picked.filePaths[0])
  })
  ipcMain.handle('agentTeams:readMemory', (_event, kind: unknown, id: unknown) =>
    readMemory(MemoryKindSchema.parse(kind), IdSchema.parse(id))
  )
  ipcMain.handle('agentTeams:writeMemory', (_event, kind: unknown, id: unknown, text: unknown) =>
    writeMemory(
      MemoryKindSchema.parse(kind),
      IdSchema.parse(id),
      z.string().max(200_000).parse(text)
    )
  )
  ipcMain.handle('agentTeams:prepareLaunch', (_event, id: unknown, task: unknown) =>
    prepareAgentLaunch(
      IdSchema.parse(id),
      z
        .string()
        .max(20_000)
        .optional()
        .parse(task ?? undefined)
    )
  )
  ipcMain.handle('agentTeams:importOpenMausBot', () => importFromOpenMausBot())
  ipcMain.handle('agentTeams:revealHome', () => shell.openPath(agentTeamsHome()))
}
