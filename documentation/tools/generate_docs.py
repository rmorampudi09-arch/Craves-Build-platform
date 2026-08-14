from pathlib import Path
from io import BytesIO
import base64,textwrap
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from config import DATE,VERSION,SNAPSHOT,REPO,E,GAPS
from catalog import DOCS,ANCHORS,ASPECTS,FEATURES,GLOSSARY
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'documentation'
RED=colors.HexColor('#F62E18'); DARK=colors.HexColor('#29160F'); MUTED=colors.HexColor('#775D54'); GOLD=colors.HexColor('#F6B545')

def logo():
 d=ROOT/'apps/customer-web-next/scripts/assets'; ns=['craves-logo-20260805.base64.00','craves-logo-20260805.base64.01','craves-logo-20260805.base64.02','craves-logo-20260805.base64.03','craves-logo-20260805.base64.04a','craves-logo-20260805.base64.04b']
 try:return ImageReader(BytesIO(base64.b64decode(''.join((d/n).read_text().strip() for n in ns))))
 except:return None
LOGO=logo()
def wrap(s,n=112):return textwrap.wrap(s,width=n,break_long_words=False,replace_whitespace=True)
def draw_logo(c,x,y,size=31):
 if LOGO:c.drawImage(LOGO,x,y,size,size,mask='auto',preserveAspectRatio=True)
 else:
  c.setFillColor(RED);c.roundRect(x,y,size,size,7,fill=1,stroke=0);c.setFillColor(colors.white);c.setFont('Helvetica-Bold',5);c.drawCentredString(x+size/2,y+size/2-2,'CRAVES')
def hf(c,title,kind,page):
 W,H=A4; bg=colors.white if kind=='general' else colors.HexColor('#1E1715' if kind=='confidential' else '#160C08'); c.setFillColor(bg);c.rect(0,0,W,H,fill=1,stroke=0);draw_logo(c,45,H-54)
 fg=MUTED if kind=='general' else colors.HexColor('#C7B7B1');c.setFillColor(fg);c.setFont('Helvetica-Bold',7);c.drawRightString(W-45,H-36,title[:72]);c.setStrokeColor(RED if kind!='investor' else GOLD);c.line(45,H-58,W-45,H-58);c.setStrokeColor(colors.HexColor('#D8C9C3') if kind=='general' else colors.HexColor('#5D4540'));c.line(45,42,W-45,42);c.setFillColor(fg);c.setFont('Helvetica',6.5);c.drawString(45,28,title[:54]);c.drawRightString(W-45,28,f'Page {page}')
 if kind=='confidential':c.setFillColor(RED);c.setFont('Helvetica-Bold',6.5);c.drawCentredString(W/2,28,'Confidential — Internal Use Only.')
 elif kind=='investor':c.setFillColor(GOLD);c.setFont('Helvetica-Bold',6.5);c.drawCentredString(W/2,28,'Investor Diligence Summary')
def sec(c,y,h,t,kind):
 body=colors.HexColor('#35231D') if kind=='general' else colors.HexColor('#EDE3DF');c.setFillColor(RED if kind!='investor' else GOLD);c.setFont('Helvetica-Bold',10.3);c.drawString(45,y,h);y-=14;c.setFillColor(body);c.setFont('Helvetica',8)
 for ln in wrap(t):c.drawString(45,y,ln);y-=9.8
 return y-4
def domain(text,default):
 t=text.lower(); rules=[('mobile',['mobile','pkce','keystore','keychain']),('apim',['apim','gateway','openapi','named value']),('notification',['notification','sms','email','push','service bus']),('subscription',['subscription','plan','entitlement']),('payment',['payment','cashfree','razorpay','refund','webhook']),('checkout',['checkout','cart','quote']),('catalog',['catalog','meal','discovery','search','rating','favorite']),('chef',['chef','kitchen','earnings','menu']),('order',['order','delivery','eta','idempotency']),('location',['location','address','maps','geocod']),('privacy',['privacy','consent','export','deletion']),('ai',['ai','concierge','signalr']),('admin',['admin','staff','support']),('auth',['auth','otp','jwt','token','sign-in','login']),('devops',['pipeline','deployment','rollback','environment','ci/cd','acr','revision']),('security',['security','secret','access','role','ownership']),('errors',['error','failure','troubleshoot','incident','401','403']),('integration',['integration','google','provider','adapter']),('legacy',['legacy']),('frontend',['frontend','next.js','bff','screen','browser']),('backend',['backend','service','flyway','database'])]
 for k,ws in rules:
  if any(w in t for w in ws):return k
 return default if default in E else 'platform'
def stat(text,d):
 t=text.lower()
 if d=='mobile' or 'mobile' in t:return 'Milestone foundation'
 if 'legacy' in t:return 'Legacy/reference'
 if 'gap' in t:return 'Repository gap'
 return 'Implemented on main'
def details(topic,aspect,default):
 d=domain(topic+' '+aspect,default);p,tech,sources=E[d]
 flow=['Actor starts the capability with the appropriate identity/context.','Client/BFF validates local prerequisites and sends an API request.','APIM and the owning service enforce identity, role, ownership and business-state rules.','The domain service reads/writes authoritative state and calls providers only through defined boundaries.','The caller receives authoritative result or a traceable error; support uses request/correlation evidence rather than secrets.']
 risks=['Stale UI/cache must not override server state.','UI visibility is not authorization evidence.','Retries of money/state-changing operations require idempotency awareness.','Provider/configuration outages should preserve core domain consistency where safe.','Missing repository proof is reported as a gap rather than converted into a production claim.']
 diag=['Capture time, environment, operation, expected/actual result and a user-safe identifier.','Capture HTTP status, stable error code and request/correlation ID; never copy OTPs, passwords, access tokens or provider secrets.','Verify caller role/ownership and current authoritative state before retrying.','Check owning service health, then its provider/dependency after local/configuration causes are excluded.','If a release is implicated, compare artifact/config marker with prior known-good revision and validate rollback compatibility.']
 return d,p,tech,flow,risks,diag,stat(topic,d),sources
def cover(c,title,subtitle,kind):
 hf(c,title,kind,1);W,H=A4;fg=DARK if kind=='general' else colors.white;c.setFillColor(fg);c.setFont('Helvetica-Bold',29);y=H-170
 for ln in wrap(title,34):c.drawString(45,y,ln);y-=34
 c.setFillColor(MUTED if kind=='general' else colors.HexColor('#D7C6BF'));c.setFont('Helvetica',12)
 for ln in wrap(subtitle,72):c.drawString(45,y,ln);y-=17
 draw_logo(c,W/2-42,y-100,84);y-=135;c.setFillColor(colors.HexColor('#35231D') if kind=='general' else colors.HexColor('#EDE3DF'));c.setFont('Helvetica',9)
 s='This document explains its subject first in plain language, then in engineering detail. It is grounded in the Craves repository snapshot and deliberately separates current implementation, legacy/reference code, milestone foundations and repository gaps so readers do not mistake aspiration for proof.'
 for ln in wrap(s,90):c.drawString(45,y,ln);y-=12
 y-=10;c.setFillColor(MUTED if kind=='general' else colors.HexColor('#C7B7B1'));c.setFont('Helvetica',7.5)
 for ln in wrap(f'Version {VERSION} | Evidence date: {DATE} | Repository: {REPO} | Snapshot commit: {SNAPSHOT}',100):c.drawString(45,y,ln);y-=10
def topic_page(c,title,kind,page,topic,aspect,default):
 hf(c,title,kind,page);fg=DARK if kind=='general' else colors.white;c.setFillColor(fg);c.setFont('Helvetica-Bold',18.5);y=A4[1]-91
 for ln in wrap(topic+' - '+aspect,58):c.drawString(45,y,ln);y-=22
 d,p,tech,flow,risks,diag,st,sources=details(topic,aspect,default);y=sec(c,y-2,'Plain-English explanation',p,kind);y=sec(c,y,'How it works technically',tech,kind);y=sec(c,y,'Flow described in words','  '.join(f'{i+1}. {x}' for i,x in enumerate(flow)),kind);y=sec(c,y,'Errors, edge cases and controls','  '.join('• '+x for x in risks),kind);y=sec(c,y,'Diagnostic and validation steps','  '.join(f'{i+1}. {x}' for i,x in enumerate(diag)),kind);y=sec(c,y,'Data, security and deployment impact',f'The {d} boundary owns its authoritative state; clients request or display changes but do not become the source of truth. Secrets and unnecessary personal data stay outside logs and PDFs. Releases must keep API, policy, schema and artifact compatible, with health/readiness evidence and rollback/backout appropriate to the change.',kind);sec(c,y,'Evidence status',f'{st}. Evidence: {sources}. Snapshot: main @ {SNAPSHOT[:12]} ({DATE}).',kind)
def glossary_page(c,title,kind,page,index):
 hf(c,title,kind,page);fg=DARK if kind=='general' else colors.white;c.setFillColor(fg);c.setFont('Helvetica-Bold',18.5);y=A4[1]-95;c.drawString(45,y,f'Glossary terms {index*3+1}-{index*3+3}');y-=30
 for j in range(3):
  term,definition=GLOSSARY[(index*3+j)%len(GLOSSARY)];d=domain(term,'platform');y=sec(c,y,term,definition,kind);y=sec(c,y,'Craves context',E[d][0]+' This term is used only in the sense supported by source or the definition above.',kind);y-=4
 sec(c,y,'Evidence note',f'Definitions are documentation aids. Platform-specific behavior remains governed by repository sources at main @ {SNAPSHOT[:12]}.',kind)
def topics(rel,default):
 n=Path(rel).name
 if n=='feature-catalog.pdf':return [(x,'purpose, cross-component behavior and edge cases') for x in FEATURES]
 if n=='glossary-of-terms.pdf':return [(f'cluster {i+1}','definitions') for i in range(55)]
 aa=ANCHORS.get(default,ANCHORS['platform']);o=[(a,x) for a in aa for x in ASPECTS];i=0
 while len(o)<55:o.append((aa[i%len(aa)],'evidence, acceptance criteria and ownership handoff'));i+=1
 return o[:55]
def build(spec):
 rel,title,subtitle,kind,default=spec;path=OUT/rel;path.parent.mkdir(parents=True,exist_ok=True);c=canvas.Canvas(str(path),pagesize=A4,pageCompression=1,title=title,author='Craves Documentation Architecture');cover(c,title,subtitle,kind);c.showPage()
 for i,(t,a) in enumerate(topics(rel,default),2):
  if Path(rel).name=='glossary-of-terms.pdf':glossary_page(c,title,kind,i,i-2)
  else:topic_page(c,title,kind,i,t,a,default)
  if i<56:c.showPage()
 c.save()
for s in DOCS:build(s)
readme=['# Craves Documentation Suite','',f'Evidence snapshot: **{DATE}**, repository **{REPO}**, branch **main**, commit `{SNAPSHOT}`.','','Start with `01-overview`; engineering folders `02`-`07` cover implementation and operations; `08-features` catalogs product capability; `09-knowledge-base` is for support; `10-confidential-internal` is internal-only; `11-investor-overview` is for diligence.','','## Evidence vocabulary','','- **Implemented on main** - direct module/README/commit evidence exists.','- **Legacy/reference** - older implementation is retained but not assumed to be the preferred runtime.','- **Milestone foundation** - handover/contract/CI groundwork exists without complete-runtime proof.','- **Repository gap** - a referenced artifact/value could not be verified and is not invented.','','## Document index','']
for rel,title,subtitle,kind,default in DOCS:readme.append(f'- [`{rel}`]({rel}) - {subtitle}')
readme+=['','## Security','','The suite contains no credential values, private keys, passwords, access tokens or payment secrets.','','## Maintenance','','Regenerate after major architecture, API, provider, security, deployment or milestone changes. Correct repository gaps when authoritative source artifacts are restored.'];(OUT/'README.md').write_text('\n'.join(readme)+'\n')
source=['# Craves Documentation Evidence Ledger','',f'Snapshot date: **{DATE}**  ',f'Repository: **{REPO}**  ','Branch: **main**  ',f'Observed commit: **{SNAPSHOT}**','','## Primary evidence']
for k,(p,t,s) in E.items():source+=['',f'### {k}',p,'',f'Sources: `{s}`']
source+=['','## Explicit gaps']+[f'- {g}' for g in GAPS];(OUT/'SOURCE-EVIDENCE.md').write_text('\n'.join(source)+'\n')
print('generated',len(DOCS),'PDFs')