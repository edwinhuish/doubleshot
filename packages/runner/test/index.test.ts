import path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execa } from '@esm2cjs/execa'
import fs from 'fs-extra'
import type { DoubleShotRunnerConfigExport } from '../src'

const bin = path.resolve(__dirname, '../dist/cli.js')
const mockDir = path.resolve(__dirname, './mock')
const configFile = path.resolve(mockDir, 'dsr.config.ts')

const writeConfigFile = (config: DoubleShotRunnerConfigExport) => {
  const configContent = `
    import { defineConfig } from "../../src"
    export default defineConfig(${JSON.stringify(config)})
  `
  fs.writeFileSync(configFile, configContent)
}

const installDeps = async (cwd: string) => {
  const { stdout, stderr } = await execa(
    'npm',
    ['install', '--package-lock=false'],
    {
      cwd,
    },
  )

  const logs = stdout + stderr
  return logs
}

const remove = () => {
  fs.removeSync(configFile)
  fs.removeSync(path.resolve(mockDir, 'dist'))
}

const run = async (command: string) => {
  const { stdout, stderr } = await execa(
    bin,
    [command],
    {
      cwd: mockDir,
    },
  )

  const logs = stdout + stderr
  return logs
}

beforeAll(async () => {
  remove()
  await installDeps(path.resolve(mockDir, 'backend'))
}, Infinity)

afterAll(() => {
  remove()
})

describe('Doubleshot Runner', () => {
  it('should run all commands', async () => {
    writeConfigFile({
      run: [
        {
          cwd: 'frontend',
          commands: {
            build: 'npm run build',
          },
        },
        {
          cwd: 'backend',
          commands: {
            build: 'npm run build',
          },
        },
      ],
    })

    const logs = await run('build')

    expect(logs).toContain('build frontend')
    expect(logs).toContain('build backend')
  })

  it('should run commands by alias', async () => {
    writeConfigFile({
      run: [
        {
          cwd: 'frontend',
          commands: {
            dev: 'npm run dev',
          },
        },
        {
          cwd: 'backend',
          commands: {
            build: {
              alias: 'dev',
              command: 'npm run build',
            },
          },
        },
      ],
    })

    const logs = await run('dev')

    expect(logs).toContain('run frontend in dev mode')
    expect(logs).toContain('build backend')
  })

  it('should throw error if no config file', async () => {
    try {
      fs.removeSync(configFile)
      await run('build')
    }
    catch (e) {
      expect(e.message).toContain('doubleshot runner needs a config file')
    }
  })

  it('should kill others if some one is set "killOthersWhenExit: true" and run failed', async () => {
    writeConfigFile({
      run: [
        {
          cwd: 'frontend',
          commands: {
            build: {
              command: 'npm run not-exist',
              killOthersWhenExit: true,
            },
          },
        },
        {
          cwd: 'backend',
          commands: {
            build: 'npm run build',
          },
        },
      ],
    })

    let logs = ''
    try {
      logs = await run('build')
    }
    catch (e) {
      logs = e.message
    }

    expect(logs).toContain('killing others')
  })

  it('should skip the specified filter names', async () => {
    writeConfigFile({
      run: [
        {
          name: 'frontend',
          cwd: 'frontend',
          commands: {
            build: 'npm run build',
          },
        },
        {
          name: 'backend',
          cwd: 'backend',
          commands: {
            build: 'npm run build',
          },
        },
      ],
      filter: ['backend'],
    })

    const logs = await run('build')
    expect(logs).toContain('build frontend')
    expect(logs).not.toContain('build backend')
  })

  it('should run electron build if "electronBuild" config is set', async () => {
    writeConfigFile({
      run: [
        {
          cwd: 'frontend',
          commands: {
            build: 'npm run build',
          },
        },
        {
          cwd: 'backend',
          commands: {
            build: 'npm run build',
          },
        },
      ],
      electronBuild: {
        projectDir: 'backend',
        commandName: 'build',
        config: 'electron-builder.config.js',
      },
    })

    const logs = await run('build')

    expect(logs).toContain('Electron build finished')
    expect(fs.existsSync(path.resolve(mockDir, 'dist'))).toBe(true)
  }, 10 * 60 * 1000)
})
