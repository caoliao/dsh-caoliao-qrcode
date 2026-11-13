import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { resolve, join, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { Readable } from 'node:stream'

const bundle = resolve(process.env.CAOLIAO_HARNESS_BUNDLE || 'dist/dsh-caoliao-qrcode')
const require = createRequire(join(bundle, 'package.json'))
const { Context, Service } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')))
const { default: SkillRegistry, renderSkillContent } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-skill')))
const plugin = await import(pathToFileURL(join(bundle, 'index.js')))
const { CaoliaoOAuth, GRANT_KEY, TOKEN_REF, SERVER, ISSUER, rpcHandler, registerOAuthRoute } = await import(pathToFileURL(join(bundle, 'oauth.js')))

test('installable package declares its bundle and includes compiled client and Skill', async () => {
  const pkg = JSON.parse(await readFile(join(bundle, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'dsh-caoliao-qrcode')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.match(await readFile(join(bundle, pkg.dsh.bundle.patch), 'utf8'), /name: dsh-caoliao-qrcode/)
  for (const entry of [pkg.main, pkg.exports['./client'], pkg.icon, 'skills/caoliao-admin/SKILL.md']) {
    assert.ok((await readFile(join(bundle, entry))).length)
  }
  const client = await readFile(join(bundle, 'client.js'), 'utf8')
  assert.doesNotMatch(client, /__CAOLIAO_(LOGO|STYLES)__/)
  assert.match(client, /data:image\/png;base64,/)
  for (const hook of ['prepare', 'preinstall', 'install', 'postinstall']) assert.equal(pkg.scripts?.[hook], undefined)
})

function memory() {
  const records = new Map(), refs = new Map()
  let tail = Promise.resolve()
  return { records, refs,
    async readRecord(key) { return records.get(key) },
    modifyRecord(key, fn) {
      const op = tail.then(async () => {
        const record = await fn(records.get(key))
        if (record !== undefined) records.set(key, record)
        return records.get(key)
      })
      tail = op.catch(() => {})
      return op
    },
    async deleteRecord(key) { records.delete(key) },
    async resolve(key) { return refs.has(key) ? { value: refs.get(key), source: 'test' } : undefined },
    async set(key, value) { refs.set(key, value) },
    async unset(key) { refs.delete(key) },
  }
}
function manager() {
  const entries = new Map()
  return { entries, list: () => [...entries.keys()].map(name => ({ name, status: { state: 'connected' } })),
    register(name, entry) { assert.ok(!entries.has(name)); entries.set(name, entry); return () => entries.delete(name) },
    async restart() {},
  }
}
function fixture() {
  let now = Date.now(), invalid = false, outage = false
  const calls = []
  const ctx = { credentials: memory(), mcpManager: manager() }
  const oauth = new CaoliaoOAuth(ctx, { now: () => now, fetch: async (url, options) => {
    calls.push({ url, options })
    if (outage) throw new Error('secret-from-provider-must-not-escape')
    if (url.endsWith('dynamic_client_register')) return Response.json({ client_id: 'public-client', token_endpoint_auth_method: 'none' })
    if (url.endsWith('/revoke')) return new Response('')
    if (invalid) return Response.json({ error: 'invalid_grant', error_description: 'secret-must-not-escape' }, { status: 400 })
    return Response.json({ access_token: 'access-secret-' + calls.length, refresh_token: 'refresh-secret-' + calls.length, token_type: 'Bearer', expires_in: 120 })
  } })
  const begin = async () => {
    const { url } = await oauth.start()
    const auth = new URL(url)
    const callback = new URL(auth.searchParams.get('redirect_uri'))
    callback.search = new URLSearchParams({ state: auth.searchParams.get('state'), iss: ISSUER, code: 'one-time-code' })
    return { auth, callback }
  }
  return { ctx, oauth, calls, begin, advance: ms => { now += ms }, invalidate: () => { invalid = true }, outage: () => { outage = true } }
}

test('PKCE validates state/issuer and stores credentials only in host', async () => {
  const f = fixture()
  try {
    const { auth, callback } = await f.begin()
    assert.equal(auth.origin, ISSUER)
    assert.equal(auth.searchParams.get('code_challenge_method'), 'S256')
    const bad = new URL(callback); bad.searchParams.set('state', 'attacker')
    assert.equal((await fetch(bad)).status, 400)
    bad.searchParams.set('state', auth.searchParams.get('state')); bad.searchParams.set('iss', 'https://attacker.invalid')
    assert.equal((await fetch(bad)).status, 400)
    assert.equal(f.calls.length, 1)
    const response = await fetch(callback)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /text\/html/)
    assert.match(response.headers.get('content-security-policy'), /script-src 'nonce-/)
    const html = await response.text()
    assert.match(html, /授权成功，接下来回到 DeepSeek/)
    assert.match(html, /history.replaceState/)
    assert.doesNotMatch(html, /one-time-code|access-secret|refresh-secret/)
    assert.ok(!html.includes(auth.searchParams.get('state')))
    const tokenCall = f.calls.find(x => x.url.endsWith('/token'))
    assert.equal(createHash('sha256').update(tokenCall.options.body.get('code_verifier')).digest('base64url'), auth.searchParams.get('code_challenge'))
    assert.equal(tokenCall.options.body.get('redirect_uri'), auth.searchParams.get('redirect_uri'))
    assert.equal(f.ctx.credentials.records.get(GRANT_KEY).kind, 'grant')
    assert.equal(f.ctx.mcpManager.entries.get(SERVER).headers.Authorization, 'Bearer ${credential:CAOLIAO_OAUTH_ACCESS_TOKEN}')
    assert.equal(f.oauth.status().mcpStatus, 'connected')
    assert.doesNotMatch(JSON.stringify(f.oauth.status()), /secret|one-time-code/)
  } finally { await f.oauth.dispose() }
})

test('refresh serializes token rotation and restores after plugin restart', async () => {
  const f = fixture()
  try {
    await fetch((await f.begin()).callback)
    f.advance(70000)
    await Promise.all([f.oauth.restore(), f.oauth.restore(), f.oauth.restore()])
    assert.equal(f.calls.filter(x => x.url.endsWith('/token')).length, 2)
    const stored = f.ctx.credentials.records.get(GRANT_KEY).payload
    assert.equal(f.ctx.credentials.refs.get(TOKEN_REF), stored.accessToken)
    await f.oauth.dispose()
    assert.equal(f.ctx.mcpManager.entries.size, 0)
    const restored = new CaoliaoOAuth(f.ctx, { now: () => stored.expiresAt - 100000, fetch: () => { throw new Error('must not need network') } })
    try { await restored.init(); assert.equal(restored.status().phase, 'authorized') }
    finally { await restored.dispose() }
  } finally { await f.oauth.dispose() }
})

test('invalid refresh grant removes tools and requests reauthorization', async () => {
  const f = fixture()
  try {
    await fetch((await f.begin()).callback)
    f.advance(70000); f.invalidate(); await f.oauth.restore()
    assert.equal(f.oauth.status().phase, 'reauth')
    assert.equal(f.ctx.mcpManager.entries.size, 0)
    assert.equal(f.ctx.credentials.refs.size, 0)
    assert.doesNotMatch(JSON.stringify(f.oauth.status()), /secret/)
  } finally { await f.oauth.dispose() }
})

test('expired token plus network failure cannot leave tools registered', async () => {
  const f = fixture()
  try {
    await fetch((await f.begin()).callback)
    f.advance(130000); f.outage(); await f.oauth.restore()
    assert.equal(f.ctx.mcpManager.entries.size, 0)
    assert.equal(f.ctx.credentials.refs.size, 0)
    assert.doesNotMatch(JSON.stringify(f.oauth.status()), /secret/)
  } finally { await f.oauth.dispose() }
})

test('disconnect deletes credentials and revokes refresh token', async () => {
  const f = fixture()
  try {
    await fetch((await f.begin()).callback)
    await f.oauth.disconnect(); await f.oauth.restore()
    assert.equal(f.ctx.credentials.records.size, 0)
    assert.equal(f.ctx.credentials.refs.size, 0)
    assert.equal(f.ctx.mcpManager.entries.size, 0)
    assert.ok(f.calls.some(x => x.url.endsWith('/revoke') && x.options.body.get('token_type_hint') === 'refresh_token'))
  } finally { await f.oauth.dispose() }
})

test('cancel closes callback; denial stores nothing; concurrent connect shares a flow', async () => {
  const f = fixture()
  try {
    const { callback } = await f.begin()
    const urls = await Promise.all([f.oauth.start(), f.oauth.start()])
    assert.equal(urls[0].url, urls[1].url)
    assert.equal(f.calls.length, 1)
    await f.oauth.cancel()
    await assert.rejects(fetch(callback))
    const denied = (await f.begin()).callback
    denied.searchParams.delete('code'); denied.searchParams.set('error', 'access_denied')
    assert.equal((await fetch(denied)).status, 400)
    assert.equal(f.ctx.credentials.records.size, 0)
  } finally { await f.oauth.dispose() }
})

test('cancel during token exchange never reconnects', async () => {
  const f = fixture()
  try {
    const { callback } = await f.begin()
    const original = f.oauth.fetch
    let entered, complete
    const ready = new Promise(resolve => { entered = resolve })
    const gate = new Promise(resolve => { complete = resolve })
    f.oauth.fetch = async (...args) => { if (args[0].endsWith('/token')) { entered(); await gate }; return original(...args) }
    const response = fetch(callback)
    await ready
    const cancelled = f.oauth.cancel()
    complete()
    await response; await cancelled; await f.oauth.restore()
    assert.equal(f.ctx.credentials.records.size, 0)
    assert.equal(f.ctx.mcpManager.entries.size, 0)
  } finally { await f.oauth.dispose() }
})

test('existing server stays intact and OAuth RPC requires owner peer', async () => {
  const f = fixture()
  try {
    f.ctx.mcpManager.entries.set(SERVER, { original: true })
    await assert.rejects(f.oauth.start(), /同名/)
    assert.equal(f.calls.length, 0)
    const handler = rpcHandler(f.oauth)
    assert.equal((await handler('connect', {}, undefined, { principal: { kind: 'api-key' } })).error.code, 'forbidden')
    assert.equal((await handler('status', {}, undefined, { principal: { kind: 'owner' } })).ok, true)
    assert.deepEqual(f.ctx.mcpManager.entries.get(SERVER), { original: true })
  } finally { await f.oauth.dispose() }
})

test('official Cordis/Skill registry loads standalone bundle and unloads RPC', async () => {
  class Manager extends Service { constructor(ctx) { super(ctx, 'mcpManager'); Object.assign(this, manager()) } }
  class Credentials extends Service { constructor(ctx) { super(ctx, 'credentials'); Object.assign(this, memory()) } }
  const routes = new Map()
  class WebServer extends Service {
    constructor(ctx) { super(ctx, 'webServer') }
    register(route) {
      routes.set(route.path, route.handler)
      return () => routes.delete(route.path)
    }
  }
  class Connection extends Service {
    constructor(ctx) { super(ctx, 'connection') }
    admit() { return { peer: { principal: { kind: 'owner' } } } }
    // Match HostConnectionService: routes use the calling plugin's Context.
    // Cordis must enforce its webServer injection, even for an indirect access.
    get rpc() {
      const owner = this.ctx
      return { handle: (path, fn) => owner.effect(() => owner.webServer.register({ path, handler: fn })) }
    }
  }
  const ctx = new Context()
  try {
    await ctx.plugin(SkillRegistry); await ctx.plugin(Manager); await ctx.plugin(Credentials); await ctx.plugin(WebServer); await ctx.plugin(Connection)
    const fiber = ctx.plugin(plugin)
    await fiber
    const skill = await ctx.skills.get('caoliao-admin')
    assert.ok(isAbsolute(skill.resourceBase.path))
    assert.match(skill.content, /mcp__caoliao-qrcode__auth_get_context/)
    assert.match(renderSkillContent(skill), /Base directory for this skill:/)
    const manifest = JSON.parse(await readFile(join(bundle, 'skill-manifest.json'), 'utf8'))
    for (const name of Object.keys(manifest.source_files_sha256)) assert.ok((await readFile(join(skill.resourceBase.path, name))).length)
    assert.equal(routes.size, 1)
    await fiber.dispose()
    assert.equal(routes.size, 0)
    assert.equal(await ctx.skills.get('caoliao-admin'), undefined)
  } finally { await ctx.fiber.dispose() }
})

test('HTTP route preserves admission, owner checks and native RPC envelopes', async () => {
  const f = fixture()
  let handler, admission = { rejection: 401 }
  registerOAuthRoute({ effect: fn => fn(), webServer: { register: route => { handler = route.handler; return () => {} } },
    connection: { admit: () => admission } }, f.oauth)
  const request = async (message = { type: 'client-request', rpcId: 'test-id', method: 'status', payload: {} }) => {
    const req = Readable.from([JSON.stringify(message)])
    Object.assign(req, { url: '/caoliao-qrcode/status', method: 'POST', headers: { 'content-type': 'application/json' } })
    const res = { writeHead(status) { this.status = status; this.headersSent = true }, end(body) { this.body = JSON.parse(body) } }
    await handler(req, res)
    return res
  }
  try {
    assert.equal((await request()).status, 401)
    admission = { peer: { principal: { kind: 'api-key' } } }
    assert.equal((await request()).body.result.error.code, 'forbidden')
    admission = { peer: { principal: { kind: 'owner' } } }
    const res = await request()
    assert.equal(res.status, 200)
    assert.equal(res.body.type, 'server-response')
    assert.equal(res.body.rpcId, 'test-id')
    assert.equal(res.body.result.value.phase, 'disconnected')
    assert.equal((await request({ type: 'client-request', rpcId: 'test-id', method: 'connect' })).status, 400)
  } finally { await f.oauth.dispose() }
})

test('client entry registers native sidebar and renders with React', async () => {
  let client
  runInNewContext(await readFile(join(bundle, 'client.js'), 'utf8'), { window: { __ModuleLoader__: { load: module => { client = module.factory(require) } } } })
  const entries = []
  client.apply({ connection: {}, slots: {
    inject: (_name, fn) => { fn(); return () => {} },
    register: (slot, component) => { entries.push({ slot, component }); return () => {} },
  } })
  assert.ok(entries.some(x => x.slot.name === 'sidebar.panellist' && x.slot.id === 'caoliao-qrcode'))
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const markup = renderToStaticMarkup(React.createElement(entries.find(x => x.slot.name === 'main').component))
  assert.match(markup, /草料二维码/)
  assert.match(markup, /快速建码/)
  assert.match(markup, /data:image\/png;base64,/)
  assert.doesNotMatch(markup, /__CAOLIAO_|auth_get_context|Skill|MCP|凭据|实例/)
  assert.doesNotMatch(markup, /API Key|secret/)
})

test('UI maps official MCP connected, failure and reconnect states distinctly', async () => {
  let client
  runInNewContext(await readFile(join(bundle, 'client.js'), 'utf8'), { window: { __ModuleLoader__: { load: module => { client = module.factory(require) } } } })
  const state = mcpStatus => client.connectionView({ phase: 'authorized', mcpStatus })
  assert.equal(state('connected').tone, 'success')
  assert.equal(state('connected').label, '已连接')
  assert.equal(state('connecting').tone, 'progress')
  assert.match(state('connecting').title, /授权成功/)
  assert.equal(state('failed').tone, 'danger')
  assert.match(state('failed').title, /服务连接失败/)
  assert.equal(state('reconnecting').tone, 'warning')
  assert.equal(state('waiting-credentials').tone, 'danger')
  assert.equal(state('closed').label, '连接已断开')
  assert.equal(state('disabled').label, '连接已断开')
  assert.equal(state('unknown').label, '状态待确认')
  assert.equal(client.connectionView({ phase: 'authorizing' }).label, '等待授权')
  assert.equal(client.connectionView({ phase: 'unavailable' }).tone, 'warning')
})

test('connect opens during the click, navigates after RPC and retains blocked-popup fallback', async () => {
  let client
  runInNewContext(await readFile(join(bundle, 'client.js'), 'utf8'), { window: { __ModuleLoader__: { load: module => { client = module.factory(require) } } } })
  const order = [], url = 'https://oauth.cli.im/oauth/authorize?state=test'
  const tab = { opener: 'parent', closed: false, location: { replace: target => order.push(target) }, close() { this.closed = true } }
  await client.connectAccount(async () => { order.push('rpc'); assert.equal(tab.opener, null); return { url } }, target => { order.push(target); return tab })
  assert.deepEqual(order, ['about:blank', 'rpc', url])
  const fallback = await client.connectAccount(async () => ({ url }), () => null)
  assert.equal(fallback.url, url)
  await assert.rejects(client.connectAccount(async () => { throw new Error('request failed') }, () => tab))
  assert.equal(tab.closed, true)
})
