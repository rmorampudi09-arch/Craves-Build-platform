#!/usr/bin/env python3
"""Compare the effective Explorer operation policy and reject inherited transformations."""
import pathlib
import sys
import xml.etree.ElementTree as ET

def normalized(node):
    return (node.tag, sorted(node.attrib.items()), (node.text or '').strip(),
            tuple(normalized(child) for child in node))

if sys.argv[1] == 'operation':
    actual = ET.fromstring(pathlib.Path(sys.argv[2]).read_text())
    expected = ET.fromstring(pathlib.Path(sys.argv[3]).read_text().replace('__BACKEND_URL__', sys.argv[4]))
    if normalized(actual) != normalized(expected):
        raise SystemExit('ERROR: Explorer operation policy differs from the reviewed authentication, limits or rewrite structure.')
elif sys.argv[1] == 'inherited':
    root = ET.fromstring(pathlib.Path(sys.argv[2]).read_text())
    forbidden = {'set-backend-service', 'rewrite-uri', 'set-method', 'set-url', 'set-body',
                 'send-request', 'send-one-way-request', 'log-to-eventhub', 'trace',
                 'authentication-basic', 'authentication-managed-identity', 'authentication-certificate',
                 'include-fragment', 'return-response', 'set-status', 'find-and-replace',
                 'cache-lookup', 'cache-store', 'cache-lookup-value', 'cache-store-value',
                 'json-to-xml', 'xml-to-json', 'xsl-transform'}
    for node in root.iter():
        if node.tag in forbidden or 'backend-id' in node.attrib:
            raise SystemExit('ERROR: Inherited policy transformation needs a separate effective-policy review.')
        if node.tag == 'set-header' and node.attrib.get('name', '').lower() in {'authorization', 'cookie', 'set-cookie'}:
            raise SystemExit('ERROR: Inherited credential replacement is not permitted.')
else:
    raise SystemExit('Unknown policy verification mode')
