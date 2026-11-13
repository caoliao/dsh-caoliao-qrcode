import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill'
import { EnvHttpProxyAgent, fetch } from 'undici'
import { CaoliaoOAuth, registerOAuthRoute } from './oauth.js'

export const name = 'caoliao-qrcode-companion'
// Connection registers RPC routes using this plugin's scoped Context.
export const inject = ['skills', 'mcpManager', 'credentials', 'connection', 'webServer']
export const Config = z.object({})

const providerName = 'caoliao-qrcode-bundled'
const root = new URL('./skills/caoliao-admin/', import.meta.url)

export async function apply(ctx) {
  const manifest = JSON.parse(await readFile(new URL('./skill-manifest.json', import.meta.url), 'utf8'))
  if (manifest.name !== 'caoliao-admin' || !manifest.description) throw new Error('Invalid skill manifest; rebuild the bundle')
  // Fail before registering anything if the generated content is absent.
  await readFile(new URL('SKILL.md', root), 'utf8')

  const dispatcher = new EnvHttpProxyAgent()
  const oauth = new CaoliaoOAuth(ctx, { fetch: (url, options) => fetch(url, { ...options, dispatcher }) })
  ctx.effect(() => async () => { await oauth.dispose(); await dispatcher.close() })
  registerOAuthRoute(ctx, oauth)
  await oauth.init()

  ctx.skills.registerProvider(() => ({
    name: providerName,
    async list() {
      return { complete: true, candidates: [{
        name: manifest.name,
        description: manifest.description,
        invocation: { modelInvocable: true, userInvocable: true },
        provider: providerName,
        source: 'bundled',
        rank: BUNDLED_SKILL_RANK,
        path: fileURLToPath(new URL('SKILL.md', root)),
        resourceBase: { kind: 'directory', path: fileURLToPath(root).replaceAll('\\', '/') },
        locator: 'caoliao-admin',
      }] }
    },
    async get(candidate, options = {}) {
      if (candidate.name !== manifest.name || candidate.locator !== 'caoliao-admin') return undefined
      const raw = await readFile(new URL('SKILL.md', root), { encoding: 'utf8', signal: options.signal })
      const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u.exec(raw)
      if (!frontmatter) throw new Error('Invalid bundled SKILL.md')
      const { rank, locator, ...summary } = candidate
      return { ...summary, content: raw.slice(frontmatter[0].length).trim() }
    },
  }))
}
