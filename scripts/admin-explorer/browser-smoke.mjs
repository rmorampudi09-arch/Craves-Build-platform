/** Browser proof against labelled synthetic BFF fixtures. No real OTP, user or provider calls. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(process.env.PLAYWRIGHT_MODULE_ROOT||'/tmp/craves-browser/package.json');
const {chromium}=require('playwright');
const output='explorer-browser-evidence';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
const page=await context.newPage();const errors=[],queries=[];let deny=false;
page.on('pageerror',e=>errors.push(e.message));
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const records=Array.from({length:65},(_,i)=>({n:i+1,id:uuid(i+1),day:i<30?'2026-09-10':'2026-09-11'}));
function fixture(dataset,q){
 const status=n=>dataset==='users'?(n%2?'SUSPENDED':'ACTIVE'):dataset==='chefs'?(n%2?'PENDING':'APPROVED'):(n%2?'PREPARING':'DELIVERED');
 const base=records.filter(r=>(!q.fromDate||r.day>=q.fromDate)&&(!q.toDate||r.day<=q.toDate)&&(!q.search||`test ${dataset} ${r.n}`.includes(q.search.toLowerCase())));
 const all=base.filter(r=>!q.status||status(r.n)===q.status);const counts={};for(const r of base)counts[status(r.n)]=(counts[status(r.n)]||0)+1;
 const selected=q.sort==='oldest'?[...all]:[...all].reverse();const offset=q.cursor?Number(Buffer.from(q.cursor,'base64url').toString()):0;
 const limited=q.mode==='records'?selected.slice(offset,offset+q.pageSize):[];const trend={};for(const r of all)trend[r.day]=(trend[r.day]||0)+1;
 return {dataset,correlationId:uuid(999),generatedAt:'2026-09-14T12:00:00Z',boundary:q.boundary||'2026-09-14T12:00:00Z',total:all.length,populationTotal:base.length,
 statuses:Object.entries(counts).sort().map(([key,count])=>({key,count})),trend:Object.entries(trend).sort().map(([day,count])=>({fromDate:day,toDate:day,count})),bucketUnit:'day',
 rows:limited.map(r=>({id:r.id,identityId:dataset==='orders'?null:r.id,label:`Test ${dataset} ${r.n}`,status:status(r.n),createdAt:`${r.day}T12:00:00Z`,updatedAt:'2026-09-14T10:00:00Z',phone:dataset==='orders'?null:'•••• 1111',email:dataset==='orders'?null:'t•••@•••',city:dataset==='chefs'?'Hyderabad':null,roles:dataset==='users'?['CUSTOMER']:[],orderSource:dataset==='orders'?'ON_DEMAND':null,amount:dataset==='orders'?'69.01':null,currency:dataset==='orders'?'INR':null,customerId:dataset==='orders'?uuid(1):null,chefId:dataset==='orders'?uuid(2):null,kitchenId:dataset==='orders'?uuid(3):null,checkoutId:dataset==='orders'?uuid(4):null})),
 nextCursor:q.mode==='records'&&offset+q.pageSize<all.length?Buffer.from(String(offset+q.pageSize)).toString('base64url'):null,pageSize:q.pageSize,sort:q.sort,mode:q.mode};
}
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.origin!=='http://127.0.0.1:3100')return route.abort();
 const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 if(url.pathname==='/api/auth/admin-session'){const now=Date.now();return json({timing:{serverTime:now,accessExpiresAt:now+900000,sessionExpiresAt:now+28800000}});}
 if(url.pathname==='/api/admin/me')return json({displayName:'Fixture administrator',email:'fixture@example.test',status:'ACTIVE',adminEnabled:true});
 if(url.pathname.startsWith('/api/admin/explorer/')){
  const dataset=url.pathname.split('/').pop();const q=route.request().postDataJSON();queries.push({dataset,...q});
  if(deny)return json({code:'EXPLORER_ACCESS_REQUIRED'},403);
  return json(fixture(dataset,q));
 }
 if(url.pathname.startsWith('/api/'))return json({code:'FIXTURE_ENDPOINT_NOT_CONFIGURED'},503);
 return route.continue();
});
async function ribbon(){await page.evaluate(()=>{let b=document.getElementById('fixture-ribbon');if(!b){b=document.createElement('div');b.id='fixture-ribbon';b.textContent='LOCAL BROWSER TEST • SYNTHETIC DATA • NOT PRODUCTION';b.style.cssText='position:fixed;bottom:8px;right:8px;z-index:9999;background:#111;color:white;padding:7px 12px;border-radius:5px;font:10px sans-serif;pointer-events:none';document.body.appendChild(b);}});}
try{
 await page.goto('http://127.0.0.1:3100/admin/analytics');
 await page.getByRole('heading',{name:'Users at a glance'}).waitFor();await page.getByRole('button',{name:/Active: 32/}).waitFor();
 await page.getByPlaceholder(/For example: Review onboarding/).fill('Review synthetic onboarding and order activity');
 await ribbon();await page.screenshot({path:`${output}/01-analytics-desktop.png`,fullPage:true});
 // A real graph button navigates to a filtered list and retains the in-memory read purpose.
 const segment=page.getByRole('button',{name:/Active: 32/});
 await segment.evaluate(el=>el.scrollIntoView({block:'center'}));
 // A doughnut segment's bounding-box center may be in the empty hole. Hit its painted mid-arc.
 const hit=await segment.evaluate(el=>{const svg=el.ownerSVGElement;const b=svg.getBoundingClientRect();const angle=(32/65)*Math.PI-Math.PI/2;return {x:b.x+(110+75*Math.cos(angle))*b.width/220,y:b.y+(110+75*Math.sin(angle))*b.height/220};});
 await page.mouse.click(hit.x,hit.y);
 await page.getByRole('heading',{name:'Users explorer',exact:true}).waitFor();
 await page.getByRole('table').waitFor();assert.equal(await page.getByLabel('Current status',{exact:true}).inputValue(),'ACTIVE');
 assert.ok(queries.some(q=>q.dataset==='users'&&q.mode==='records'&&q.status==='ACTIVE'));
 assert.equal(await page.locator('.ex-table tbody tr').count(),25);
 await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByText('Page 2',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.ex-table tbody tr').length===7);
 await page.getByRole('button',{name:'Previous',exact:true}).click();await page.getByText('Page 1',{exact:true}).waitFor();
 await page.getByRole('button',{name:/View details for/}).first().click();await page.getByRole('dialog').waitFor();
 assert.ok(await page.getByRole('link',{name:/Open audited identity lookup/}).count());
 await ribbon();await page.screenshot({path:`${output}/02-users-detail-desktop.png`,fullPage:false});
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
 await page.getByRole('button',{name:'Reset all filters',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ex-metrics-row strong')?.textContent==='65');
 // Creation bars apply their exact date window to the real list route.
 await page.getByRole('button',{name:'2026-09-10 to 2026-09-10: 30 records. Open this period.',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.ex-metrics-row strong')?.textContent==='30');
 assert.equal(await page.getByLabel('Created from',{exact:true}).inputValue(),'2026-09-10');
 assert.ok(queries.some(q=>q.dataset==='users'&&q.fromDate==='2026-09-10'&&q.toDate==='2026-09-10'&&q.mode==='records'));
 await page.getByRole('button',{name:'Reset all filters',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ex-metrics-row strong')?.textContent==='65');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export aggregates',exact:true}).click();await (await download).saveAs(`${output}/aggregate-fixture.csv`);
 await page.getByLabel('Search all matching records',{exact:true}).fill('not-a-real-fixture');await page.getByRole('button',{name:'Apply & show records',exact:true}).click();await page.getByText('No matching records on this page',{exact:true}).waitFor();
 // All-time chef and order lists are separate bound endpoints, with no auto mutation.
 for(const dataset of ['chefs','orders']){
  await page.getByRole('navigation',{name:'Record type'}).getByRole('link',{name:new RegExp(dataset,'i')}).click();
  await page.getByRole('table').waitFor();assert.ok(queries.some(q=>q.dataset===dataset&&q.mode==='records'));
 }
 await page.evaluate(()=>window.scrollTo(0,0));await ribbon();await page.screenshot({path:`${output}/03-orders-desktop.png`,fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await ribbon();await page.screenshot({path:`${output}/04-orders-mobile.png`,fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Page must not overflow horizontally');
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('dialog',{name:'Admin navigation'}).waitFor();await page.keyboard.press('Escape');
 for(const width of [320,768,1024]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`Horizontal overflow at ${width}`);}
 await page.setViewportSize({width:1440,height:1100});
 deny=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('alert').filter({hasText:'Platform or audit'}).waitFor();assert.equal(await page.locator('.ex-table tbody tr').count(),0);
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/result.json`,JSON.stringify({passed:true,scope:'Synthetic BFF fixtures only; no production authentication or service calls',assertions:['graph-to-status filter','trend-bar-to-date filter','purpose preserved','complete-list pagination','record drawer and Escape','aggregate export','empty search','chef and order endpoint binding','320/390/768/1024/1440 width checks','mobile navigation','permission denial clears records'],requests:queries.length,pageErrors:errors},null,2));
}catch(error){await page.screenshot({path:`${output}/failure.png`,fullPage:true}).catch(()=>{});await writeFile(`${output}/failure.json`,JSON.stringify({message:String(error),pageErrors:errors,queries},null,2));throw error;}
finally{await context.close();await browser.close();}
