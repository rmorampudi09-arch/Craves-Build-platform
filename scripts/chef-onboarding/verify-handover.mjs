import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const require=createRequire(process.env.PLAYWRIGHT_MODULE_ROOT);
const {chromium}=require("playwright");
const output=path.resolve("chef-onboarding-deliverables");
const manifest=JSON.parse(await readFile(path.join(output,"chef-onboarding-manifest.json"),"utf8"));
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1000,height:1400},deviceScaleFactor:1});
  await page.goto(pathToFileURL(path.join(output,"Craves-Chef-Onboarding-V2-Handover.html")).href);
  await page.emulateMedia({media:"print"});
  await page.evaluate(()=>document.fonts.ready);
  const report=await page.evaluate(()=>[...document.querySelectorAll(".page")].map((element,index)=>{
    const footer=element.querySelector("footer").getBoundingClientRect();
    const content=element.querySelector(".page-content").getBoundingClientRect();
    const box=element.getBoundingClientRect();
    return {page:index+1,contentBottom:content.bottom,footerTop:footer.top,
      fits:content.bottom<=footer.top-8 && element.scrollWidth<=box.width+1};
  }));
  if(report.length!==manifest.handoverPages || report.length<50 || report.some(item=>!item.fits))
    throw new Error("Handover page count or overflow validation failed: "+JSON.stringify(report.filter(item=>!item.fits)));
  await mkdir(path.join(output,"rendered-pages"),{recursive:true});
  for(let index=0;index<report.length;index++)
    await page.locator(".page").nth(index).screenshot({path:path.join(output,"rendered-pages",String(index+1).padStart(3,"0")+".png")});
  await writeFile(path.join(output,"handover-render-report.json"),JSON.stringify({source:manifest.head,pages:report.length,overflowPages:0,format:"A4 HTML",checks:report},null,2));
  console.log("Verified "+report.length+" pages with no overflow; rendered every page.");
} finally {await browser.close();}
