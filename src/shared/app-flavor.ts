/** Orca Agents: a fork of Orca that installs beside it. Every identity that could collide with the stock app reads from here. */
export const APP_FLAVOR = {
  displayName: 'Orca Agents',
  userDataDirName: 'orca-agents',
  bundleId: 'com.frisky.orca-agents',
  protocolScheme: 'orca-agents',
  cliName: 'orca-agents',
  updatesEnabled: false
} as const
