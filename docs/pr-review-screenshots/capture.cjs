const {createRequire}=require('module');
const {readFileSync,writeFileSync,mkdirSync}=require('fs');
const req=createRequire('/workspace/chaos/package.json');
const postcss=createRequire(req.resolve('@tailwindcss/postcss'))('postcss');
const tailwind=req('@tailwindcss/postcss');
const {chromium}=req('@playwright/test');
const root='/workspace/chaos/';
const out='/workspace/.cloud-setup/chaos/merge-screenshots';
(async()=>{
let css=(await postcss([tailwind({base:root})]).process(readFileSync(root+'app/globals.css','utf8'),{from:root+'app/globals.css'})).css;
for(const file of ['app/workspace.css','app/landing.css','components/card/card.css','components/courses/courses.css','components/learn/learn.css','components/forms/formThemes.css']) css+='\n'+readFileSync(root+file,'utf8');
css+='\n:root{--font-inter:Arial;--font-cairo:Arial;--font-space-grotesk:Arial}body{margin:0;font-family:Arial,sans-serif}body>main.workspace-ui,.fixture.workspace-ui{padding:24px;min-height:100vh}.fixture{max-width:1100px;margin:auto;padding:24px}.evidence-label{padding:8px 16px;background:#e5e7eb;color:#111;font:12px Arial;direction:ltr}*{animation:none!important;transition:none!important}';
writeFileSync(out+'/styles.css',css);mkdirSync(out+'/images',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
for(const screen of ['card','course','settings','privacy','terms','compare','locked']) for(const lang of ['en','ar']) for(const scheme of ['light','dark']) for(const [size,width,height] of [['desktop',1280,960],['phone',390,844]]){
const page=await browser.newPage({viewport:{width,height},colorScheme:scheme});
await page.route('**/*',r=>r.abort());
let markup=readFileSync(`${out}/markup/${screen}-${lang}-${scheme}.html`,'utf8');
if(screen==='card')markup=`<main class="fixture workspace-ui">${markup}</main>`;
await page.setContent(`<!doctype html><html lang="${lang}" dir="${lang==='ar'?'rtl':'ltr'}" class="${scheme==='dark'?'dark':''}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div class="evidence-label">PR review: actual React component + shipped CSS; synthetic state; system fonts.</div>${markup}</body></html>`);
if(screen==='settings'){
await page.evaluate(()=>{const keep=document.querySelector('#settings-student-cards').closest('section');document.querySelector('main').replaceChildren(keep);});
}
if(screen==='privacy'||screen==='terms'){
const ps=page.locator('.site-legal p, .site-legal li');let target;
for(let i=0;i<await ps.count();i++)if(/private draft|مسودات خاصة|مسودة.{0,4} خاصة|private drafts/.test(await ps.nth(i).textContent())){target=ps.nth(i);break;}
if(!target)throw new Error('No changed draft paragraph '+screen+' '+lang);
await target.scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollBy(0,-100));
}
const filename=`${screen}-${lang}-${scheme}-${size}.png`;
await page.screenshot({path:out+'/images/'+filename,fullPage:screen==='card'||screen==='compare'});
await page.close();
}
await browser.close(); console.log('56 component screenshots captured');
})().catch(e=>{console.error(e);process.exitCode=1});
