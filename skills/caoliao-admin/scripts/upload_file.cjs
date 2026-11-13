// 上传清单只引用本地文件和原始 MCP 凭证文件；不调用 MCP、不申请新凭证。
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const io = require('./transfer.cjs');

async function upload(file, ticket, send = io.transfer) {
  const result = {ok: false, state: 'not_sent', needs_status_query: true, next_action: 'assets_get_upload'};
  let started = false;
  try {
    ticket = io.unwrap(ticket);
    if (!ticket || typeof ticket.file_key !== 'string' || !/^free\/[A-Za-z0-9_./-]+$/.test(ticket.file_key) || ticket.file_key.includes('..')) throw new Error('invalid_file_key');
    result.file_key = ticket.file_key;
    if (ticket.state === 'temporary_available') return {...result, ok: true, state: 'already_available'};
    if (ticket.state !== 'uploading' || !Number.isFinite(ticket.upload_expires_at) || ticket.upload_expires_at <= Date.now() / 1000) throw new Error('ticket_unavailable_or_expired');
    const d = ticket.upload;
    if (!d || d.method !== 'PUT' || !d.headers || typeof d.headers !== 'object') throw new Error('invalid_descriptor');
    const normalized = {};
    for (const [name, value] of Object.entries(d.headers)) {
      const key = name.toLowerCase();
      if (!/^[A-Za-z0-9-]+$/.test(name) || typeof value !== 'string' || /[^\x20-\x7e]/.test(value) || key in normalized || ['authorization','proxy-authorization','cookie','host','transfer-encoding'].includes(key)) throw new Error('invalid_headers');
      normalized[key] = value;
    }
    if (!normalized['content-type'] || (ticket.mime_type && ticket.mime_type !== normalized['content-type'])) throw new Error('mime_mismatch');
    io.options(d.url, 'PUT', d.headers);
    const size = fs.statSync(file).size;
    if (size <= 0 || size > 20 * 1024 * 1024 || normalized['content-length'] !== String(size) || (ticket.size !== undefined && ticket.size !== size)) throw new Error('size_mismatch');
    const bytes = fs.readFileSync(file);
    if (bytes.length !== size) throw new Error('size_mismatch');
    started = true;
    await send(d.url, 'PUT', d.headers, bytes, 1024 * 1024);
    return {...result, ok: true, state: 'bytes_sent_pending_verification'};
  } catch (e) {
    const safe = /^(invalid_[a-z_]+|ticket_unavailable_or_expired|mime_mismatch|size_mismatch|storage_http_\d+|transport_failed|transport_timeout|response_too_large)$/;
    return {...result, state: started ? 'upload_outcome_unknown' : 'not_sent', error_code: safe.test(e.message) ? e.message : 'local_input_unavailable'};
  }
}
async function main(argv) {
  const a = io.args(argv);
  let items, base;
  if (a.manifest && !a.file && !a.descriptor) {
    items = io.readJson(a.manifest); base = path.dirname(path.resolve(a.manifest));
  } else if (a.file && a.descriptor && !a.manifest) {
    items = [{item_key: 'file', file: a.file, descriptor: a.descriptor}]; base = process.cwd();
  } else throw new Error('invalid_arguments');
  if (!Array.isArray(items) || !items.length || items.length > 100 || new Set(items.map(x => x.item_key)).size !== items.length) throw new Error('invalid_manifest');
  const started = Date.now();
  const results = await io.pool(items, async item => {
    try {
      if (typeof item.item_key !== 'string' || !item.item_key) throw new Error();
      return {item_key: item.item_key, ...await upload(path.resolve(base, item.file), io.readJson(path.resolve(base, item.descriptor)))};
    } catch (_) { return {item_key: item.item_key, ok: false, state: 'not_sent', error_code: 'local_input_unavailable'}; }
  });
  console.log(JSON.stringify({items: results, elapsed_ms: Date.now() - started}));
  return results.every(x => x.ok) ? 0 : 1;
}
if (require.main === module) main(process.argv.slice(2)).then(code => {process.exitCode = code;}).catch(() => {console.log(JSON.stringify({ok:false,error_code:'invalid_local_input'}));process.exitCode=1;});
module.exports = {upload, main};
