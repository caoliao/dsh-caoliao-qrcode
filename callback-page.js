import { readFileSync } from 'node:fs'
const logo = readFileSync(new URL('./logo.png', import.meta.url)).toString('base64')

export function callbackPage(success, nonce) {
  const title = success ? '授权成功，接下来回到 DeepSeek' : '这次授权未完成'
  const detail = success ? '你的草料授权已收到并保存。接下来，DeepSeek 将连接草料服务，为你准备可用功能。' : '请返回 DeepSeek 的草料二维码页面，查看当前状态并重新发起连接。'
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${success ? '草料授权成功' : '草料授权未完成'}</title>
<style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:#f3f8f4;color:#20392b;font-family:system-ui,"Microsoft YaHei",sans-serif;min-height:100vh;display:grid;place-items:center;padding:28px}main{width:min(100%,580px);padding:40px;border-radius:28px;background:white;border:1px solid #deeadf;box-shadow:0 16px 60px #204d2510}.brand{display:flex;align-items:center;gap:12px;font-size:15px;font-weight:600;color:#51745c}.brand img{width:48px;height:48px;border-radius:12px}.badge{display:inline-flex;margin-top:32px;padding:6px 12px;border-radius:99px;background:${success ? '#e5f6eb' : '#fff0e8'};color:${success ? '#087a39' : '#a74116'};font-size:13px;font-weight:600}h1{font-size:27px;line-height:1.45;letter-spacing:-.5px;margin:16px 0}p{color:#61756a;line-height:1.85;font-size:15px}.steps{padding:18px 22px;background:#f6f9f6;border-radius:16px;margin:24px 0}.steps p{margin:6px 0;font-size:14px}.steps b{color:#008b40;margin-right:10px}.done{padding:16px 20px;border-radius:14px;background:#edf7ef;border:1px solid #d4e9d9}.done strong{display:block;font-size:15px;color:#245b37}.done p{margin:6px 0 0;font-size:13px}.done kbd{font-family:inherit;background:white;border:1px solid #d0ddd3;border-radius:5px;padding:1px 5px}.note{font-size:12px;margin:16px 0 0}@media(max-width:520px){main{padding:28px}h1{font-size:23px}}
</style></head><body><main><div class="brand"><img src="data:image/png;base64,${logo}" alt="草料二维码">草料二维码 × DeepSeek</div><div class="badge">${success ? '✓ 账号授权成功' : '！请重新授权'}</div><h1>${title}</h1><p>${detail}</p>
<div class="steps"><p><b>1</b>切换回 DeepSeek，打开「草料二维码」。</p><p><b>2</b>${success ? '等待状态显示绿色「已连接」。' : '点击连接按钮，重新完成账号授权。'}</p><p><b>3</b>新建会话，说说你想完成的工作。</p></div>
<div class="done"><strong>你可以关闭此页面了</strong></div><p class="note" id="note">${success ? '授权成功不代表服务已连接，请以客户端显示的连接状态为准。' : '此页面可以安全关闭，不会影响你返回客户端重新操作。'}</p></main>
<script nonce="${nonce}">history.replaceState(null,'','/oauth/callback');</script></body></html>`
}
