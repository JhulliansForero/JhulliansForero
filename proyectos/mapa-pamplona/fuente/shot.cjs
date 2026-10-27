const pw=require('playwright'); const fs=require('fs');
(async()=>{
 const b=await pw.chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'],headless:false});
 const p=await b.newPage({viewport:{width:Number(process.env.W||1280),height:Number(process.env.H||800)}, colorScheme: process.env.DARK?'dark':'light'});
 await p.route('**/three.min.js', r=>r.fulfill({body:fs.readFileSync('lib/package/build/three.js'), contentType:'application/javascript'}));
 const logs=[]; p.on('console',m=>{ if(['error','warning'].includes(m.type())) logs.push(m.type()+': '+m.text())}); p.on('pageerror',e=>logs.push('PAGEERR '+e.message+' '+(e.stack||'').split('\n').slice(0,6).join(' | ')));
 await p.goto('http://127.0.0.1:8766/test.html'); await p.waitForTimeout(4000);
 const steps=JSON.parse(process.argv[2]);
 for (const [name, js, wait] of steps) { if (js) await p.evaluate(js); await p.waitForTimeout(wait); await p.screenshot({path:name+'.png'}); console.log('shot', name); }
 console.log(logs.filter(l=>!/CERT|fonts\.g/.test(l)).slice(0,12).join('\n'));
 await b.close();
})();
