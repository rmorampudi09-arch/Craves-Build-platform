#!/usr/bin/env python3
"""Offline source-integrity gate. This does not call Azure, a provider or a production DB."""
from pathlib import Path
import hashlib
import xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[2]
services=['auth','user-chef','order']
for relative in ['src/main/java/in/craves/adminexplorer/ExplorerQuery.java','src/main/java/in/craves/adminexplorer/ExplorerRateLimiter.java','src/test/java/in/craves/adminexplorer/ExplorerRateLimiterPostgresTest.java','src/main/java/in/craves/adminexplorer/ExplorerEngine.java','src/test/java/in/craves/adminexplorer/ExplorerQueryTest.java','src/test/java/in/craves/adminexplorer/ExplorerPostgresTest.java']:
    copies=[(root/f'services/{s}-service'/relative).read_bytes() for s in services]
    assert copies[0]==copies[1]==copies[2], f'Shared implementation drift: {relative}'
    print(relative, hashlib.sha256(copies[0]).hexdigest())
for service,domain in zip(services,['users','chefs','orders']):
    base=root/f'services/{service}-service'
    source=(base/'src/main/java/in/craves/adminexplorer/ExplorerDomain.java').read_text()
    assert f'DATASET="{domain}"' in source
    controllers=list(base.glob('src/main/java/**/admin/explorer/AdminExplorerController.java'))
    assert len(controllers)==1
    text=controllers[0].read_text()
    assert f'/api/v1/admin/explorer/{domain}' in text
    assert '${CRAVES_ADMIN_EXPLORER_ENABLED:false}' in text
    assert '"PLATFORM_ADMIN", "AUDIT_ADMIN"' in text
    assert '@Import(ExplorerEngine.class)' in text
    versions=[p.name.split('__',1)[0] for p in (base/'src/main/resources/db/migration').glob('V*.sql')]
    assert len(set(versions))==len(versions),f'Migration version collision: {service}'
ET.parse(root/'infra/apim/admin-explorer/authenticated-policy.xml')
print('PASS: shared source, fixed domain bindings, disabled defaults, version uniqueness and XML syntax')
