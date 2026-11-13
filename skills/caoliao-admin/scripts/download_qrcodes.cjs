// 读取已授权结果中的官方 PNG，一次下载并按需生成自包含 A4 HTML；不重新编码二维码。
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const io = require('./transfer.cjs');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function printHtml(items) {
  return '<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>二维码标签</title><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font:12px sans-serif}.page{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(5,52mm);gap:3mm 6mm;break-after:page}.page:last-child{break-after:auto}.label{text-align:center;overflow:hidden;border:1px dashed #bbb;padding:2mm}.label img{width:38mm;height:38mm;display:block;margin:auto}.name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style>' +
    Array.from({length:Math.ceil(items.length/10)}, (_,p) => '<section class="page">' + items.slice(p*10,p*10+10).map(x => '<div class="label"><img alt="二维码" src="data:image/png;base64,' + x.bytes.toString('base64') + '"><div class="name">'+escape(x.name || x.item_key)+'</div></div>').join('') + '</section>').join('') + '</html>';
}
async function download(items, output, print, send = io.transfer) {
  if (!Array.isArray(items) || !items.length || items.length > 1000 || new Set(items.map(x=>x.item_key)).size !== items.length) throw new Error('invalid_manifest');
  // 全新目录防止重试时覆盖用户已有文件；失败项在回执中保留，不把部分成功当全部成功。
  fs.mkdirSync(output);
  const started = Date.now(); const images = new Array(items.length); let printBytes = 0;
  const results = await io.pool(items, async (item, i) => {
    try {
      if (typeof item.item_key !== 'string' || !item.item_key || (item.status && item.status !== 'succeeded')) throw new Error();
      const bytes = await send(item.qrcode_image_url || item.qrcode_url, 'GET', {}, undefined, 5*1024*1024);
      if (bytes.length < 24 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('invalid_png');
      const file = String(i+1).padStart(4,'0') + '.png';
      fs.writeFileSync(path.join(output,file), bytes, {flag:'wx'});
      if (print) {
        printBytes += bytes.length;
        if (printBytes <= 32*1024*1024) images[i] = {item_key:item.item_key, name:item.name, bytes};
      }
      return {item_key:item.item_key,name:item.name || '',ok:true,file};
    } catch (e) {
      return {item_key:item.item_key,ok:false,error_code:/^(storage_http_\d+|invalid_png|transport_failed|transport_timeout|response_too_large|invalid_url)$/.test(e.message) ? e.message : 'download_failed'};
    }
  });
  const report = {items:results,total:items.length,succeeded:results.filter(x=>x.ok).length,elapsed_ms:Date.now()-started};
  if (print && printBytes > 32*1024*1024) report.print_error = 'print_images_too_large';
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2),{flag:'wx'});
  // 部分缺图时不生成可能被误当完整批次的打印文件。
  if (print && !report.print_error && report.succeeded === report.total) fs.writeFileSync(path.join(output,'labels-a4.html'),printHtml(images),{flag:'wx'});
  return report;
}
async function main(argv) {
  const a = io.args(argv);
  if (!a.manifest || !a.output || (a.print && a.print !== 'a4')) throw new Error();
  const report = await download(io.readJson(a.manifest),path.resolve(a.output),a.print === 'a4');
  console.log(JSON.stringify(report)); return report.succeeded === report.total && !report.print_error ? 0 : 1;
}
if(require.main===module) main(process.argv.slice(2)).then(code=>{process.exitCode=code;}).catch(()=>{console.log(JSON.stringify({ok:false,error_code:'invalid_input_or_output_exists'}));process.exitCode=1;});
module.exports={download,printHtml};
