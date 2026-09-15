#!/usr/bin/env python3
"""Read-only Azure document configuration audit. Never prints secret values."""
import argparse
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]
PUBLIC_SETTINGS=['CRAVES_DOCUMENTS_ENABLED','CRAVES_DOCUMENTS_WORKER_ENABLED','CRAVES_DOCUMENTS_EMAIL_ENABLED',
    'CRAVES_DOCUMENTS_SOURCES_ENABLED','CRAVES_DOCUMENTS_WEB_ENABLED','CRAVES_DOCUMENTS_ORDER_BASE_URL',
    'CRAVES_DOCUMENTS_INTEGRATION_BASE_URL','CRAVES_DOCUMENTS_SUBSCRIPTION_BASE_URL',
    'CRAVES_DOCUMENTS_BLOB_ENDPOINT','CRAVES_DOCUMENTS_BLOB_CONTAINER','CRAVES_DOCUMENTS_ALLOW_LOCAL_HTTP']
REQUIRED_EMAIL=['ACS_EMAIL_CONNECTION_STRING','ACS_EMAIL_SENDER_ADDRESS','CRAVES_AUTH_INTERNAL_BASE_URL','CRAVES_AUTH_INTERNAL_SERVICE_SECRET']

def az(*args):
    result=subprocess.run(['az',*args,'--only-show-errors','-o','json'],capture_output=True,text=True,timeout=90)
    if result.returncode: raise RuntimeError('Azure read failed; no response body or credentials were published')
    return json.loads(result.stdout) if result.stdout.strip() else None

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    inventory=json.loads((ROOT/'config/production/azure-resource-inventory.json').read_text())
    rg=inventory['resourceGroup']
    evidence={'mode':'READ_ONLY','runtimeAcceptance':'NOT_PERFORMED','sourceDeploymentVerified':False,'applications':{},'missingBindings':[]}
    for name in ['notification','order','integration','subscription']:
        app=inventory['containerApps'][name]
        # Explicit public-setting projection: no general environment values or secrets are fetched.
        query="{name:name,readyRevision:properties.latestReadyRevisionName,fqdn:properties.configuration.ingress.fqdn,settings:properties.template.containers[0].env[?contains(`"+json.dumps(PUBLIC_SETTINGS)+"`, name)].{name:name,value:value,secretRef:secretRef}}"
        data=az('containerapp','show','-g',rg,'-n',app,'--query',query)
        evidence['applications'][name]=data
        if name=='notification':
            names=az('containerapp','show','-g',rg,'-n',app,'--query','properties.template.containers[0].env[].name') or []
            evidence['emailBindingNamesPresent']={key:key in names for key in REQUIRED_EMAIL}
            evidence['missingBindings'] += [key for key in REQUIRED_EMAIL if key not in names]
            settings={entry['name']:entry for entry in data.get('settings') or []}
            for key in ['CRAVES_DOCUMENTS_ORDER_BASE_URL','CRAVES_DOCUMENTS_INTEGRATION_BASE_URL','CRAVES_DOCUMENTS_SUBSCRIPTION_BASE_URL','CRAVES_DOCUMENTS_BLOB_ENDPOINT','CRAVES_DOCUMENTS_BLOB_CONTAINER']:
                if key not in settings: evidence['missingBindings'].append(key)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence,indent=2))
    print('Configuration presence only. No application, APIM, database, Blob or email state was changed.')

if __name__=='__main__': main()
