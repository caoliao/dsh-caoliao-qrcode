import { createServer } from 'node:http'
import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto'
import { callbackPage } from './callback-page.js'

export const RESOURCE = 'https://open.cli.im/mcp'
export const ISSUER = 'https://oauth.cli.im'
export const SCOPE = 'mcp:tools records.read templates.read templates.write qrcodes.write assets.write'
export const GRANT_KEY = 'caoliao-qrcode-companion/account'
export const TOKEN_REF = 'CAOLIAO_OAUTH_ACCESS_TOKEN'
export const SERVER = 'caoliao-qrcode'
const safeError = (message) => Object.assign(new Error(message), { userSafe: true })
const messageOf = error => error.userSafe ? error.message : '无法保存凭证或建立连接，请检查 Harness 凭据服务后重试。'
const equal = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))

// OAuth state is host-only. The UI receives status and a short-lived login URL.
export class CaoliaoOAuth {
  constructor(ctx, { fetch = globalThis.fetch, issuer = ISSUER, now = Date.now } = {}) {
    this.ctx = ctx
    this.fetch = fetch
    this.issuer = issuer
    this.now = now
    this.phase = 'disconnected'
    this.message = ''
    this.queue = Promise.resolve()
    this.life = new AbortController()
  }

  run(fn) {
    const result = this.queue.then(fn)
    this.queue = result.catch(() => {})
    return result
  }

  status() {
    const entry = this.ctx.mcpManager.list().find(x => x.name === SERVER)
    return { phase: this.phase, message: this.message, expiresAt: this.expiresAt,
      mcpStatus: this.release ? entry?.status?.state ?? 'connecting' : 'not-registered' }
  }

  async request(path, options = {}, signal = this.life.signal) {
    try {
      const response = await this.fetch(this.issuer + path, { ...options, redirect: 'error',
        signal: AbortSignal.any([signal, this.life.signal, AbortSignal.timeout(20000)]) })
      const data = await response.json()
      if (!response.ok) {
        const error = safeError('草料授权服务请求失败，请重试。')
        error.invalidGrant = data?.error === 'invalid_grant'
        throw error
      }
      return data
    } catch (error) {
      if (error.invalidGrant) throw error
      throw safeError('无法完成草料授权请求，请检查网络或代理后重试。')
    }
  }

  token(fields, signal) {
    return this.request('/oauth/token', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...fields, resource: RESOURCE }) }, signal)
  }

  grant(data, previous = {}) {
    if (typeof data.access_token !== 'string' || !data.access_token || /[\r\n]/u.test(data.access_token)
      || String(data.token_type).toLowerCase() !== 'bearer'
      || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 0) {
      throw safeError('授权服务返回了无效凭证，请重新连接。')
    }
    return { ...previous, accessToken: data.access_token,
      refreshToken: data.refresh_token || previous.refreshToken,
      expiresAt: this.now() + Number(data.expires_in) * 1000, reauth: false }
  }

  async mount(grant) {
    if (this.life.signal.aborted) return
    if (!this.release && this.ctx.mcpManager.list().some(x => x.name === SERVER)) {
      throw safeError('已有同名草料 MCP，请先停用原连接，再点击重试连接。')
    }
    const current = await this.ctx.credentials.resolve(TOKEN_REF)
    if (current?.value !== grant.accessToken) await this.ctx.credentials.set(TOKEN_REF, grant.accessToken)
    if (this.life.signal.aborted) return
    if (!this.release) this.release = this.ctx.mcpManager.register(SERVER, {
      transport: 'streamable-http', url: RESOURCE,
      headers: { Authorization: 'Bearer ${credential:CAOLIAO_OAUTH_ACCESS_TOKEN}' },
      startupTimeoutMs: 30000, toolCallTimeoutMs: 60000,
    })
    this.expiresAt = grant.expiresAt
    this.phase = 'authorized'
    this.message = ''
  }

  async unmount() {
    const release = this.release
    this.release = undefined
    if (release) await release()
  }

  async restore() {
    return this.run(async () => {
      try {
        const record = await this.ctx.credentials.modifyRecord(GRANT_KEY, async current => {
          const grant = current?.kind === 'grant' ? current.payload : undefined
          if (!grant || grant.reauth || grant.expiresAt > this.now() + 60000) return undefined
          if (!grant.refreshToken) return { kind: 'grant', payload: { ...grant, reauth: true } }
          try {
            const data = await this.token({ grant_type: 'refresh_token', refresh_token: grant.refreshToken, client_id: grant.clientId })
            return { kind: 'grant', payload: this.grant(data, grant) }
          } catch (error) {
            if (error.invalidGrant) return { kind: 'grant', payload: { ...grant, reauth: true } }
            throw error
          }
        })
        if (this.life.signal.aborted) return
        const grant = record?.payload
        if (!grant) return
        if (grant.reauth) {
          await this.unmount()
          await this.ctx.credentials.unset(TOKEN_REF)
          this.phase = 'reauth'
          this.message = '授权已失效，请断开后重新连接草料账号。'
          return
        }
        await this.mount(grant)
      } catch (error) {
        if (this.life.signal.aborted) return
        if (!this.expiresAt || this.expiresAt <= this.now()) {
          await this.unmount()
          await this.ctx.credentials.unset(TOKEN_REF)
          this.phase = 'error'
        }
        this.message = messageOf(error)
      }
    })
  }

  async init() {
    await this.restore()
    this.timer = setInterval(() => {
      if (!this.session && !this.life.signal.aborted) void this.restore()
    }, 30000)
    this.timer.unref?.()
  }

  closeSession() {
    const session = this.session
    this.session = undefined
    if (session) {
      session.abort.abort()
      clearTimeout(session.timer)
      session.server.close()
      session.server.closeIdleConnections()
    }
  }

  start() {
    return this.run(async () => {
      if (this.life.signal.aborted) throw safeError('插件已停用。')
      if (this.session?.url) return { url: this.session.url }
      if (await this.ctx.credentials.readRecord(GRANT_KEY)) throw safeError('已有授权，请先断开连接后重新登录。')
      if (this.ctx.mcpManager.list().some(x => x.name === SERVER)) throw safeError('已有同名草料 MCP，请先停用原连接。')
      const session = { state: randomBytes(32).toString('base64url'), verifier: randomBytes(32).toString('base64url'), abort: new AbortController() }
      session.server = createServer((req, res) => {
        this.callback(session, req, res).catch(() => { if (!res.headersSent) res.writeHead(400); res.end() })
      })
      this.session = session
      this.phase = 'authorizing'
      this.message = ''
      try {
        // Use a high dynamic port: Windows may otherwise allocate a browser-blocked port.
        for (let attempt = 0; ; attempt++) {
          try {
            await new Promise((resolve, reject) => {
              const fail = error => { session.server.removeListener('listening', ready); reject(error) }
              const ready = () => {
                session.server.removeListener('error', fail)
                if (session.abort.signal.aborted) { session.server.close(); reject(safeError('授权已取消。')) }
                else resolve()
              }
              session.server.once('error', fail)
              session.server.once('listening', ready)
              session.server.listen(randomInt(49152, 65536), '127.0.0.1')
            })
            break
          } catch (error) { if (!['EADDRINUSE', 'EACCES'].includes(error.code) || attempt >= 9) throw error }
        }
        session.redirect = `http://127.0.0.1:${session.server.address().port}/oauth/callback`
        const client = await this.request('/api/v1/oauth/dynamic_client_register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            client_name: 'DeepSeek Harness - 草料二维码', redirect_uris: [session.redirect],
            grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
          }),
        }, session.abort.signal)
        if (this.session !== session || session.abort.signal.aborted) throw safeError('授权已取消。')
        if (typeof client.client_id !== 'string' || !client.client_id) throw safeError('无法注册草料授权客户端。')
        if (client.token_endpoint_auth_method && client.token_endpoint_auth_method !== 'none') throw safeError('授权服务器未接受公开客户端模式。')
        session.clientId = client.client_id
        const url = new URL(this.issuer + '/oauth/authorize')
        url.search = new URLSearchParams({ client_id: session.clientId, redirect_uri: session.redirect,
          response_type: 'code', scope: SCOPE, resource: RESOURCE, state: session.state,
          code_challenge_method: 'S256', code_challenge: createHash('sha256').update(session.verifier).digest('base64url') }).toString()
        session.url = url.href
        session.timer = setTimeout(() => { void this.cancel('登录超时，请重新连接。') }, 300000)
        session.timer.unref?.()
        return { url: session.url }
      } catch (error) {
        this.closeSession()
        this.phase = 'error'
        this.message = messageOf(error)
        throw error
      }
    })
  }

  async callback(session, req, res) {
    const reply = (status) => {
      const nonce = randomBytes(18).toString('base64')
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': `default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` })
      res.end(callbackPage(status === 200, nonce))
    }
    const url = new URL(req.url, session.redirect)
    if (req.method !== 'GET' || req.headers.host !== new URL(session.redirect).host || url.pathname !== '/oauth/callback'
      || this.session !== session || session.used || !equal(url.searchParams.get('state'), session.state)) {
      reply(400, '无效的授权回调。请返回 Harness 重新连接。')
      return
    }
    if (url.searchParams.get('iss') !== this.issuer) {
      reply(400, '授权服务器不匹配。')
      return
    }
    session.used = true
    await this.run(async () => {
      try {
        if (url.searchParams.has('error') || !url.searchParams.get('code')) throw safeError('授权未完成，请重新连接。')
        const data = await this.token({ grant_type: 'authorization_code', client_id: session.clientId,
          code: url.searchParams.get('code'), redirect_uri: session.redirect, code_verifier: session.verifier }, session.abort.signal)
        if (this.session !== session || session.abort.signal.aborted) throw safeError('授权已取消。')
        const grant = this.grant(data, { clientId: session.clientId })
        await this.ctx.credentials.modifyRecord(GRANT_KEY, async () => ({ kind: 'grant', payload: grant }))
        if (!session.abort.signal.aborted) await this.mount(grant)
        reply(200, '草料授权完成。请返回 Harness 查看 MCP 连接状态。可以关闭此页面。')
      } catch (error) {
        this.phase = 'error'
        this.message = messageOf(error)
        reply(400, '授权未完成，请返回 Harness 查看状态并重试。')
      } finally { if (this.session === session) this.closeSession() }
    })
  }

  cancel(message = '') {
    const pending = Boolean(this.session)
    this.closeSession()
    // If cancellation races a committed token write, delete that grant too.
    if (pending) return this.disconnect().then(() => { this.message = message })
    return this.run(async () => {
      this.phase = 'disconnected'
      this.message = message
    })
  }

  disconnect() {
    this.closeSession()
    return this.run(async () => {
      await this.unmount()
      const record = await this.ctx.credentials.readRecord(GRANT_KEY)
      await this.ctx.credentials.deleteRecord(GRANT_KEY)
      await this.ctx.credentials.unset(TOKEN_REF)
      this.phase = 'disconnected'
      this.expiresAt = undefined
      this.message = ''
      const grant = record?.payload
      if (grant) {
        try {
          const response = await this.fetch(this.issuer + '/oauth/revoke', { method: 'POST', redirect: 'error',
            signal: AbortSignal.any([this.life.signal, AbortSignal.timeout(10000)]),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: grant.clientId, token: grant.refreshToken || grant.accessToken,
              token_type_hint: grant.refreshToken ? 'refresh_token' : 'access_token' }) })
          if (!response.ok) throw safeError('revoke failed')
          await response.body?.cancel()
        } catch { this.message = '本机连接和凭证已清除；服务端撤销未确认，可在草料账号中撤销授权。' }
      }
    })
  }

  async dispose() {
    this.life.abort()
    this.closeSession()
    clearInterval(this.timer)
    await this.queue
    await this.unmount()
  }
}

export function rpcHandler(oauth) {
  return async (endpoint, _payload, _signal, peer) => {
    const fail = (code, message) => ({ ok: false, error: { code, message, details: {} } })
    if (peer?.principal?.kind !== 'owner') return fail('forbidden', '只有当前客户端用户可以管理草料授权。')
    try {
      if (endpoint === 'status') return { ok: true, value: oauth.status() }
      if (endpoint === 'connect') return { ok: true, value: await oauth.start() }
      if (endpoint === 'cancel') await oauth.cancel()
      else if (endpoint === 'disconnect') await oauth.disconnect()
      else if (endpoint === 'retry') {
        await oauth.restore()
        if (oauth.release) await oauth.ctx.mcpManager.restart(SERVER)
      }
      else return fail('not-found', '未知操作。')
      return { ok: true, value: oauth.status() }
    } catch (error) { return fail('connection-failed', messageOf(error)) }
  }
}

// Register through the plugin's own injected webServer. In Harness 0.2.2-rc.2,
// connection.rpc.handle's scoped service context can lack webServer injection.
// Keep the native Connection admission fence and unary RPC envelope contract.
export function registerOAuthRoute(ctx, oauth) {
  const dispatch = rpcHandler(oauth)
  return ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: '/caoliao-qrcode',
    async handler(req, res) {
      const reply = (status, value) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(value))
      }
      try {
        const admission = ctx.connection.admit(req)
        if ('rejection' in admission) { reply(admission.rejection, { error: 'unauthorized' }); return }
        const path = new URL(req.url, 'http://localhost').pathname
        const endpoint = path.slice('/caoliao-qrcode/'.length)
        if (req.method !== 'POST' || !path.startsWith('/caoliao-qrcode/')
          || !['status', 'connect', 'cancel', 'disconnect', 'retry'].includes(endpoint)) {
          reply(404, { error: 'not-found' }); return
        }
        if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
          reply(415, { error: 'content-type' }); return
        }
        const chunks = []
        let size = 0
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk)
          if (size > 16384) { reply(413, { error: 'too-large' }); return }
          chunks.push(Buffer.from(chunk))
        }
        const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (message?.type !== 'client-request' || typeof message.rpcId !== 'string'
          || message.rpcId.length > 200 || message.method !== endpoint) {
          reply(400, { error: 'invalid-request' }); return
        }
        const result = await dispatch(endpoint, message.payload, undefined, admission.peer)
        reply(200, { type: 'server-response', rpcId: message.rpcId, result })
      } catch { if (!res.headersSent) reply(400, { error: 'invalid-request' }); else res.end() }
    },
  }), 'caoliao OAuth RPC')
}
