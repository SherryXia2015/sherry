import fs from 'fs'
import fsp from 'fs/promises'
import { createRequire } from 'module'
import path from 'path'

import { context, getOctokit } from '@actions/github'
import AdmZip from 'adm-zip'

const target = process.argv.slice(2)[0]
const ARCH_MAP = {
  'x86_64-pc-windows-msvc': 'x64',
  'aarch64-pc-windows-msvc': 'arm64',
}

const PROCESS_MAP = {
  x64: 'x64',
  ia32: 'x86',
  arm64: 'arm64',
}
const arch = target ? ARCH_MAP[target] : PROCESS_MAP[process.arch]

function resolveReleaseDir() {
  const candidates = target
    ? [`./target/${target}/release`, `./src-tauri/target/${target}/release`]
    : ['./target/release', './src-tauri/target/release']

  const releaseDir = candidates.find((candidate) => fs.existsSync(candidate))
  if (releaseDir === undefined) {
    throw new Error(`could not find the release dir: ${candidates.join(', ')}`)
  }

  return releaseDir
}

/// Script for ci
/// 打包绿色版/便携版 (only Windows)
async function resolvePortable() {
  if (process.platform !== 'win32') return

  const releaseDir = resolveReleaseDir()
  const configDir = path.join(releaseDir, '.config')

  await fsp.mkdir(configDir, { recursive: true })
  if (!fs.existsSync(path.join(configDir, 'PORTABLE'))) {
    await fsp.writeFile(path.join(configDir, 'PORTABLE'), '')
  }
  const zip = new AdmZip()

  zip.addLocalFile(path.join(releaseDir, 'Sherry.exe'))
  zip.addLocalFile(path.join(releaseDir, 'sherry-core.exe'))
  zip.addLocalFile(path.join(releaseDir, 'sherry-core-alpha.exe'))
  zip.addLocalFolder(path.join(releaseDir, 'resources'), 'resources')
  zip.addLocalFolder(configDir, '.config')

  const require = createRequire(import.meta.url)
  const packageJson = require('../package.json')
  const { version } = packageJson
  const zipFile = `Sherry_${version}_${arch}_portable.zip`
  zip.writeZip(zipFile)
  console.log('[INFO]: create portable zip successfully')

  if (process.env.GITHUB_TOKEN === undefined) {
    return
  }

  const options = { owner: context.repo.owner, repo: context.repo.repo }
  const github = getOctokit(process.env.GITHUB_TOKEN)
  const tag = process.env.TAG_NAME || `v${version}`
  console.log('[INFO]: upload to ', tag)

  const { data: release } = await github.rest.repos.getReleaseByTag({
    ...options,
    tag,
  })

  const assets = release.assets.filter((x) => x.name === zipFile)
  if (assets.length > 0) {
    await github.rest.repos.deleteReleaseAsset({
      ...options,
      asset_id: assets[0].id,
    })
  }

  console.log(release.name)

  await github.rest.repos.uploadReleaseAsset({
    ...options,
    release_id: release.id,
    name: zipFile,
    data: zip.toBuffer(),
  })
}

resolvePortable().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
