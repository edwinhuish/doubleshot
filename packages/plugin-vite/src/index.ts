import type { AddressInfo } from 'node:net'
import type { PluginOption, ResolvedConfig } from 'vite'
import type { ElectronConfig, InlineConfig } from '@doubleshot/builder'
import { build, dev, printLog } from '@doubleshot/builder'

export { defineConfig } from '@doubleshot/builder'

export interface VitePluginDoubleshotConfig extends Omit<InlineConfig, 'rendererUrl' | 'electron'> {
  /**
   * Renderer process url on development mode
   */
  rendererUrl?: string
  /**
   * Some configuration for electron
   */
  electron?: Omit<ElectronConfig, 'rendererUrl'> & {
    rendererUrl?: string
  }
  /**
   * This hook can override the plugin config by Vite mode ('development' or 'production')
   */
  configureForMode: (userConfig: InlineConfig, mode: string) => (void | InlineConfig) | Promise<(void | InlineConfig)>
}

export function VitePluginDoubleshot(userConfig: Partial<VitePluginDoubleshotConfig> = {}): PluginOption[] {
  const PLUGIN_NAME = 'vite-plugin-doubleshot'

  let pack: (() => Promise<void>) | undefined

  const configureForMode = async (resolvedConfig: ResolvedConfig) => {
    if (typeof userConfig.configureForMode === 'function') {
      const { mode } = resolvedConfig
      await userConfig.configureForMode(userConfig, mode)
    }
  }

  const isDebug = process.argv.includes('--dsb-debug')
  // enable debug mode
  userConfig.debug = isDebug

  return [
    {
      name: `${PLUGIN_NAME}:serve`,
      apply: 'serve',
      configResolved: async (resolvedConfig) => {
        await configureForMode(resolvedConfig)
      },
      configureServer(server) {
        server?.httpServer?.on('listening', async () => {
          if (server.httpServer && !userConfig.rendererUrl) {
            const { address, port, family } = server.httpServer.address() as AddressInfo
            if (family === 'IPv6')
              userConfig.rendererUrl = `http://[${address}]:${port}`

            else
              userConfig.rendererUrl = `http://${address}:${port}`
          }

          await dev(userConfig)

          // Debug Mode Note
          if (isDebug) {
            printLog('info', '⚠️  Debug mode enabled, in Vite plugin, @doubleshot/builder will prebuild files only.')
            printLog('info', '➡️  You should start the application manually in debug mode.(e.g. create "launch.json" in Visual Studio Code to start it)')
          }
        })
      },
    },
    {
      name: `${PLUGIN_NAME}:build`,
      apply: 'build',
      async configResolved(resolvedConfig) {
        await configureForMode(resolvedConfig)
        pack = await build(userConfig, false)
      },
      async closeBundle() {
        await pack?.()
      },
    },
  ]
}
