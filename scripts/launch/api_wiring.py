#!/usr/bin/env python3
"""API wiring check: every backend address the web, mobile and delivery-intelligence
apps call must exist as a backend endpoint.

It reads the Spring controllers under services/ and the address strings in the apps
(including `${apiBaseUrl()}/...` templates and a file's own `const BASE = '/api/v1/x'`
prefixes), and reports any address with no matching endpoint. A string the code
finishes with `${X}/...` counts as a base: it only needs an endpoint that starts with it.

Run: python3 scripts/launch/api_wiring.py   (exit 1 when an address has no endpoint)
Known, accepted exceptions go in scripts/launch/api_wiring_allowlist.json with a reason.
"""
import json
import os
import re
import sys
from pathlib import Path


def scan(ROOT):
    ROOT = str(ROOT)
    def norm(p):
        p=re.sub(r'\$\{[^}]*\}','*',p); p=re.sub(r'\{[^}]*\}','*',p); p=re.sub(r'/:[A-Za-z_]+','/*',p)
        p=p.split('?')[0].split('#')[0].rstrip('/')
        p='/'.join('*' if '*' in seg else seg for seg in p.split('/'))
        return p
    # ---- backend endpoints
    ann=re.compile(r'@(Get|Post|Put|Patch|Delete|Request)Mapping\s*(?:\(((?:[^()]|\([^()]*\))*)\))?',re.S)
    def vals(arg):
        if not arg: return ['']
        v=re.findall(r'"([^"]*)"',arg); return v or ['']
    back=set()
    for dp,_,fs in os.walk(os.path.join(ROOT,'services')):
        if '/src/test' in dp or '/target' in dp: continue
        for f in fs:
            if not f.endswith(('.java','.kt')): continue
            s=Path(dp,f).read_text(errors='ignore')
            if 'Mapping' not in s or ('@RestController' not in s and '@Controller' not in s): continue
            m=re.search(r'\bclass\s+\w+',s)
            head,body=s[:m.start()],s[m.start():]
            cm=list(ann.finditer(head)); prefixes=vals(cm[-1].group(2)) if cm else ['']
            for mm in ann.finditer(body):
                for pre in prefixes:
                    for v in vals(mm.group(2)):
                        back.add(norm('/'+'/'.join(x.strip('/') for x in (pre,v) if x.strip('/'))))
    back={b[len('/api/v1'):] if b.startswith('/api/v1/') else b for b in back}
    tops={b.split('/')[1] for b in back if b.count('/')>=1 and len(b)>1}
    # ---- client paths
    lit=re.compile(r"""(["'`])((?:/api/v1)?/[a-z][a-z0-9-]*(?:/(?:[A-Za-z0-9_.:-]+|\$\{[^}`]*\}))*/?)\1""")
    uses={};bases=set()
    tmpl=re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*(?:\(\))?)\}((?:/(?:[A-Za-z0-9_.:-]+|\$\{[^}`]*\}))+)")
    targets=[('apps/customer-web-next/src',('app/api','features','shared')),('apps/mobile/src',('',)),('apps/delivery-intelligence-admin/src',('',))]
    for app,subs in targets:
        for sub in subs:
            for dp,_,fs in os.walk(os.path.join(ROOT,app,sub)):
                if 'node_modules' in dp or '__tests__' in dp or '/tests' in dp or '/e2e' in dp: continue
                for f in fs:
                    if not f.endswith(('.ts','.tsx')) or re.search(r'\.(test|spec|vitest)\.',f): continue
                    fp=os.path.join(dp,f); s=Path(fp).read_text(errors='ignore')
                    # only files that talk to the backend
                    if 'apps/customer-web-next' in fp and not re.search(r'apiBaseUrl|authenticatedApiFetch|CRAVES_API_BASE_URL',s): continue
                    consts={}
                    for cm in re.finditer(r"""(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*\w+)?\s*=\s*(["'`])(/[^"'`$]*)\2""",s): consts[cm.group(1)]=cm.group(3)
                    found=[]
                    for m in lit.finditer(s):
                        name=None; ctx=s[max(0,m.start()-600):m.start()]
                        nm=re.search(r'(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*\w+)?\s*=\s*$',ctx)
                        km=re.search(r'([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{[^}]*$',ctx)
                        if nm: name=nm.group(1)
                        elif km and re.search(r'^\s*["\'\w-]+\s*:\s*$',ctx.split('\n')[-1]): name=km.group(1)+'['
                        base=False
                        if name:
                            n=re.escape(name.rstrip('['))
                            base=bool(re.search(r'\$\{'+n+(r'\[' if name.endswith('[') else r'\}')+r'[^`]*/|'+n+r'\s*\+\s*["\'`]/',s))
                        found.append((m.start(),m.group(2),base))
                    for m in tmpl.finditer(s):
                        expr=m.group(1)
                        if expr in ('apiBaseUrl()',) or re.fullmatch(r'(?:api)?[Bb]ase(?:Url)?(?:\(\))?|upstream\w*',expr): pre=''
                        elif expr in consts: pre=consts[expr]
                        else: continue
                        found.append((m.start(),pre+m.group(2),False))
                    for start,p,is_base in found:
                        line=s[:start].count('\n')+1
                        if p.startswith('/api/v1/'): p=p[len('/api/v1'):]
                        elif 'apps/customer-web-next' in fp and p.startswith('/api/'): continue  # web's own BFF route
                        p=norm(p)
                        if p.split('/')[1] not in tops or p.count('/')<2: continue
                        uses.setdefault(p,[]).append(os.path.relpath(fp,ROOT)+':'+str(line))
                        if is_base: bases.add(p)
    def match(c,b):
        a=c.strip('/').split('/');bb=b.strip('/').split('/')
        return len(a)==len(bb) and all(x==y or x=='*' or y=='*' for x,y in zip(a,bb))
    def prefix(c,b):
        a=c.strip('/').split('/');bb=b.strip('/').split('/')
        return len(a)<len(bb) and all(x==y or x=='*' or y=='*' for x,y in zip(a,bb))
    missing={p:sorted(set(l)) for p,l in uses.items() if not any(match(p,b) or (p in bases and prefix(p,b)) for b in back)}

    return back, uses, missing


def main():
    root = Path(__file__).resolve().parents[2]
    back, uses, missing = scan(root)
    allow = json.loads((root / 'scripts/launch/api_wiring_allowlist.json').read_text())
    broken = {p: l for p, l in missing.items() if p not in allow}
    stale = sorted(p for p in allow if p not in missing)
    print(f'API wiring: {len(back)} backend endpoints, {len(uses)} app addresses, {len(broken)} without an endpoint')
    for p, l in sorted(broken.items()):
        print(f'  NO ENDPOINT {p}  <- {", ".join(l[:3])}' + (f' (+{len(l) - 3})' if len(l) > 3 else ''))
    for p in stale:
        print(f'  STALE ALLOWLIST ENTRY {p}: it has an endpoint now, remove it')
    return 1 if broken or stale else 0


if __name__ == '__main__':
    sys.exit(main())
