/** Orca Pod: a fork of Orca that installs beside it. Every identity that could collide with the stock app reads from here.
 * Only displayName carries the new name; the ids below kept their first name (orca-teams) so existing profiles,
 * agent files and the Keychain item "orca-teams Safe Storage" stay where they are. */
export const APP_FLAVOR = {
  displayName: 'Orca Pod',
  userDataDirName: 'orca-teams',
  bundleId: 'com.frisky.orca-teams',
  /** Keep in step with config/scripts/native-build/macos/build-computer-macos.mjs; TCC grants follow this id. */
  computerUseBundleId: 'com.frisky.orca-teams.computer-use',
  protocolScheme: 'orca-teams',
  cliName: 'orca-teams',
  /** Agent and team files live here (no spaces, so CLIs take the paths as plain flags). */
  agentHomeDirName: '.orca-teams',
  updatesEnabled: false
} as const
