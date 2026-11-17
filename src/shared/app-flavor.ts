/** Orca Teams: a fork of Orca that installs beside it. Every identity that could collide with the stock app reads from here. */
export const APP_FLAVOR = {
  displayName: 'Orca Teams',
  userDataDirName: 'orca-teams',
  bundleId: 'com.frisky.orca-teams',
  protocolScheme: 'orca-teams',
  cliName: 'orca-teams',
  /** Agent and team files live here (no spaces, so CLIs take the paths as plain flags). */
  agentHomeDirName: '.orca-teams',
  updatesEnabled: false
} as const
