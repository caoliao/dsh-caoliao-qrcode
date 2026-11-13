window.__ModuleLoader__.load({
  id: 'dsh-caoliao-qrcode',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const logo = '__CAOLIAO_LOGO__'
    const styles = '__CAOLIAO_STYLES__'
    async function connectAccount(call, openWindow = (...args) => window.open(...args)) {
      // Reserve a tab during the click, before async OAuth client registration.
      let tab
      try { tab = openWindow('about:blank', '_blank'); if (tab) tab.opener = null } catch { tab = null }
      try {
        const value = await call('connect')
        try {
          if (tab && !tab.closed) tab.location.replace(value.url)
          else openWindow(value.url, '_blank', 'noopener,noreferrer')
        } catch { try { tab?.close() } catch {} }
        return value
      } catch (error) { try { tab?.close() } catch {} throw error }
    }
    function connectionView(status) {
      const view = (tone, label, title, detail) => ({ tone, label, title, detail })
      if (status.phase === 'authorized') {
        switch (status.mcpStatus) {
          case 'connected': return view('success', '已连接', '已连接，开始你的下一件事', '草料授权已完成，服务连接正常。前往新会话，告诉 DeepSeek 你想完成什么。')
          case 'connecting': return view('progress', '已授权 · 连接中', '授权成功，正在连接草料服务', '已收到你的授权，正在准备可用功能。完成后会自动变为绿色「已连接」。')
          case 'reconnecting': return view('warning', '正在重连', '授权已完成，正在恢复服务连接', '草料服务连接暂时中断，正在自动重试，无需重复授权。')
          case 'waiting-credentials': return view('danger', '连接受阻', '授权已完成，连接尚未就绪', '暂时无法使用已保存的授权。请尝试重新连接；仍未成功时，可断开后重新授权。')
          case 'failed': return view('danger', '连接失败', '授权成功，但服务连接失败', '已经收到你的授权，当前未能连上草料服务。你可以点击「重新连接」再试一次。')
          case 'closed': case 'disabled': case 'not-registered': return view('warning', '连接已断开', '账号已授权，服务尚未连接', '点击「重新连接」恢复服务，或断开账号授权。')
          default: return view('warning', '状态待确认', '账号已授权，连接状态待确认', '暂时无法确认服务是否可用，请稍后查看或重新连接。')
        }
      }
      return ({
        loading: view('progress', '正在加载', '正在获取连接状态', '请稍候，正在确认你的账号连接。'),
        disconnected: view('neutral', '未连接', '连接你的草料账号', '授权后，就能在对话中管理二维码、查看表单记录和分析巡检数据。'),
        authorizing: view('warning', '等待授权', '再一步，即可开始', '打开授权页面，登录草料并选择要使用的组织。完成后，这里会自动更新。'),
        reauth: view('danger', '授权已失效', '请重新登录草料账号', '当前授权已失效。断开后重新连接，即可继续使用。'),
        error: view('danger', '操作未完成', '连接暂未完成', '请重新尝试连接草料账号。'),
        unavailable: view('warning', '状态暂不可用', '暂时无法获取连接状态', '正在重新获取状态，请稍候。'),
      })[status.phase] || view('warning', '状态待确认', '连接状态待确认', '请稍后查看。')
    }
    const scenarios = [
      ['🟩', '快速建码', '把想法变成二维码', '帮我设计一个设备档案二维码，先给我看看方案。'],
      ['📋', '表单与记录', '让收集的信息更有条理', '帮我查看最近的表单记录，整理出需要关注的信息。'],
      ['🔍', '巡检与分析', '从日常记录中发现重点', '帮我分析本月巡检记录，总结异常情况和待跟进事项。'],
    ]
    function apply(ctx) {
      async function call(endpoint) {
        const result = await ctx.connection.rpc.call('/caoliao-qrcode', endpoint, {})
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      }
      function Panel() {
        const [status, setStatus] = React.useState({ phase: 'loading' })
        const [error, setError] = React.useState('')
        const [busy, setBusy] = React.useState(false)
        const [url, setUrl] = React.useState('')
        const [copied, setCopied] = React.useState(-1)
        React.useEffect(() => {
          let active = true, timer
          const refresh = async () => {
            try {
              const value = await call('status')
              if (active) { setStatus(value); if (value.phase !== 'authorizing') setUrl('') }
            } catch { if (active) setStatus({ phase: 'unavailable' }) }
            if (active) timer = setTimeout(refresh, 2000)
          }
          void refresh()
          return () => { active = false; clearTimeout(timer) }
        }, [])
        async function action(endpoint) {
          setBusy(true); setError('')
          try {
            const value = endpoint === 'connect' ? await connectAccount(call) : await call(endpoint)
            setUrl(value.url || '')
            setStatus(await call('status'))
          } catch { setError('这次操作未完成，请稍后再试。') }
          finally { setBusy(false) }
        }
        async function copy(prompt, index) {
          try { await navigator.clipboard.writeText(prompt); setCopied(index) }
          catch { setError('请选中下方示例文字，复制到新会话中使用。') }
        }
        const ready = status.phase === 'authorized' && status.mcpStatus === 'connected'
        const { tone, label, title, detail } = connectionView(status)
        const button = (label, endpoint, primary = false) => h('button', { className: 'cl-button' + (primary ? ' cl-primary' : ''), disabled: busy, onClick: () => action(endpoint) }, busy ? '请稍候…' : label)
        return h('div', { className: 'cl-page' }, h('style', null, styles),
          h('div', { className: 'cl-wrap' },
            h('header', { className: 'cl-header' }, h('img', { src: logo, alt: '草料二维码', className: 'cl-logo' }),
              h('div', null, h('div', { className: 'cl-eyebrow' }, '草料二维码 × DeepSeek'), h('h1', null, '把日常工作，交给一句话。'), h('p', null, '从建码到数据分析，让你的二维码工作更轻松。'))),
            h('section', { className: 'cl-connect cl-state-' + tone, 'aria-labelledby': 'cl-connect-title' },
              h('div', { className: 'cl-status cl-status-' + tone, role: 'status', 'aria-live': 'polite' }, h('span', { className: 'cl-dot', 'aria-hidden': true }), label),
              h('h2', { id: 'cl-connect-title' }, title), h('p', { className: 'cl-detail' }, detail),
              h('div', { className: 'cl-actions' },
                ['disconnected', 'error'].includes(status.phase) && button('连接草料账号 →', 'connect', true),
                status.phase === 'authorizing' && url && h('a', { className: 'cl-button', href: url, target: '_blank', rel: 'noopener noreferrer' }, '重新打开授权页面 ↗'),
                status.phase === 'authorizing' && button('取消', 'cancel'),
                ['error', 'authorized'].includes(status.phase) && !ready && button('重新连接', 'retry'),
                ['authorized', 'error', 'reauth'].includes(status.phase) && button('断开连接', 'disconnect')),
              status.phase === 'authorizing' && h('p', { className: 'cl-note' }, '请在这台电脑的浏览器中完成授权。链接 5 分钟内有效。'),
              status.message && h('p', { className: 'cl-notice', role: 'status' }, status.phase === 'disconnected' ? '本机已断开。你也可以前往草料账号管理页面查看和撤销授权。' : '当前连接需要重新确认，请重新连接草料账号。'),
              error && h('p', { className: 'cl-notice', role: 'alert' }, error)),
            h('section', { className: 'cl-ideas', 'aria-labelledby': 'cl-ideas-title' },
              h('div', { className: 'cl-section-heading' }, h('h2', { id: 'cl-ideas-title' }, '你可以这样开始'), h('span', null, '复制示例，在新会话中试一试')),
              h('div', { className: 'cl-grid' }, ...scenarios.map(([emoji, name, subtitle, prompt], index) =>
                h('article', { className: 'cl-card', key: name }, h('span', { className: 'cl-emoji', 'aria-hidden': true }, emoji),
                  h('h3', null, name), h('p', { className: 'cl-subtitle' }, subtitle), h('p', { className: 'cl-prompt' }, prompt),
                  h('button', { className: 'cl-copy', onClick: () => copy(prompt, index), 'aria-label': '复制' + name + '示例' }, copied === index ? '已复制 ✓' : '复制示例 ↗'))))),
            h('footer', { className: 'cl-footer' }, h('span', null, '🔐 由你授权，按权限访问'), h('span', null, '你可以随时断开连接。'))))
      }
      const Icon = () => h('img', { src: logo, alt: '', width: 24, height: 24, style: { borderRadius: 6, objectFit: 'contain' } })
      ctx.slots.inject('main', () => {
        const release = ctx.slots.register({ name: 'main', key: 'caoliao-qrcode' }, Panel)
        const sidebar = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'caoliao-qrcode', order: 40, label: '草料二维码' }, Icon))
        return () => { sidebar?.(); release() }
      })
    }
    return { inject: ['slots', 'connection'], apply, connectionView, connectAccount }
  },
})
