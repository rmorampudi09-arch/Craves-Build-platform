#!/usr/bin/env python3
"""Require complete API inventory and reject overlapping Explorer leaf ownership."""
import json
import pathlib
import re
import sys

BASE = 'api/v1/admin/explorer'
LEAVES = [BASE+'/'+domain+'/query' for domain in ['users','chefs','orders']]
apis = json.loads(pathlib.Path(sys.argv[2]).read_text())
assert isinstance(apis, list), 'API inventory must be a complete array, not a partial page'
if sys.argv[1] == 'inventory':
    own = [a for a in apis if a.get('path','').strip('/') == BASE]
    assert len(own) == 1 and own[0]['name'] == 'craves-admin-explorer-v1', 'Explorer API ownership is ambiguous'
    for api in apis:
        path=api.get('path','').strip('/')
        assert not path.startswith(BASE+'/'), 'A descendant API may shadow an Explorer leaf'
        if not path or BASE.startswith(path+'/'):
            assert re.fullmatch(r'[A-Za-z0-9_.;-]+',api['name']), 'Unexpected ancestor API identity'
            print(api['name'])
elif sys.argv[1] == 'ancestor':
    ancestor = next(a for a in apis if a['name'] == sys.argv[3])
    operations = json.loads(pathlib.Path(sys.argv[4]).read_text())
    assert isinstance(operations,list), 'Ancestor operation inventory is incomplete'
    prefix=ancestor.get('path','').strip('/')
    for op in operations:
        if op.get('method') not in ['POST','*']:
            continue
        template=(prefix+'/'+op['urlTemplate'].split('?')[0].strip('/')).strip('/')
        parts=re.split(r'(\{[^}]+\}|\*)',template)
        expression=''.join('.*' if p=='*' or p.startswith('{*') else '[^/]+' if p.startswith('{') else re.escape(p) for p in parts)
        assert not any(re.fullmatch(expression,leaf) for leaf in LEAVES), 'An ancestor API operation also owns an Explorer leaf'
else:
    raise SystemExit('Unknown ownership verification mode')
