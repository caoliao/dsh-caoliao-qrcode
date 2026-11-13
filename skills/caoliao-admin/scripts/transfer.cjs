// Node 18+，仅标准库；保留签名 URL 原字节，不重试、不跟随跳转、不附加账号凭证。
'use strict';
const fs = require('node:fs');
const https = require('node:https');

function readJson(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length > 4 * 1024 * 1024) throw new Error('input_too_large');
  return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
}
function unwrap(value) {
  for (let i = 0; i < 3 && value && value.data && !value.file_key && !value.items; i++) {
    if (value.code !== undefined && value.code !== 0) throw new Error('invalid_response');
    value = value.data;
  }
  return value;
}
function options(url, method, headers = {}) {
  if (typeof url !== 'string' || /[^\x21-\x7e]/.test(url)) throw new Error('invalid_url');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new Error('invalid_url');
  const raw = url.match(/^https:\/\/([^/?#]+)([^#]*)$/);
  if (!raw) throw new Error('invalid_url');
  let target = raw[2] || '/';
  if (target.startsWith('?')) target = '/' + target;
  return {hostname: parsed.hostname, port: parsed.port || 443, method, path: target, headers};
}
function transfer(url, method, headers, body, maxBytes, request = https.request) {
  return new Promise((resolve, reject) => {
    let opts;
    try { opts = options(url, method, headers); } catch (_) { reject(new Error('invalid_url')); return; }
    const req = request(opts, res => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); reject(new Error('storage_http_' + res.statusCode)); return;
      }
      const chunks = []; let bytes = 0;
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) { res.destroy(); reject(new Error('response_too_large')); }
        else chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => reject(new Error('transport_failed')));
      res.on('aborted', () => reject(new Error('transport_failed')));
    });
    const timer = setTimeout(() => { req.destroy(); reject(new Error('transport_timeout')); }, 30000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', () => { clearTimeout(timer); reject(new Error('transport_failed')); });
    req.end(body);
  });
}
async function pool(items, action, concurrency = 4) {
  const results = new Array(items.length); let index = 0;
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, async () => {
    while (index < items.length) { const i = index++; results[i] = await action(items[i], i); }
  }));
  return results;
}
function args(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || !argv[i + 1]) throw new Error('invalid_arguments');
    result[argv[i].slice(2)] = argv[i + 1];
  }
  return result;
}
module.exports = {readJson, unwrap, options, transfer, pool, args};
