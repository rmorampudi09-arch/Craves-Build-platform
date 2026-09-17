"""Read-only launch blockers: bounded aggregates and authenticated refund readiness."""
import importlib.util
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ops = load('core_email_ops', 'scripts/email/inspect-email-operations.py')
refund = load('core_refund', 'scripts/refund/refund_production_release.py')

QUERIES = {
    'auth-service': """SELECT json_build_object(
 'revocationPending', (SELECT count(*) FROM auth_token_revocation_outbox WHERE status IN ('PENDING','FAILED','PROCESSING')),
 'revocationDead', (SELECT count(*) FROM auth_token_revocation_outbox WHERE status='DEAD_LETTER'),
 'revocationPublished', (SELECT count(*) FROM auth_token_revocation_outbox WHERE status='PUBLISHED'),
 'revocationOldestSeconds', (SELECT coalesce(greatest(0,floor(extract(epoch FROM now()-min(created_at))))::bigint,0)
    FROM auth_token_revocation_outbox WHERE status IN ('PENDING','FAILED','PROCESSING')));
""",
    'subscription-service': """SELECT json_build_object(
 'invoices', (SELECT count(*) FROM subscription_schema.subscription_invoice),
 'paidInvoices', (SELECT count(*) FROM subscription_schema.subscription_invoice WHERE status='PAID'),
 'unpaidInvoices', (SELECT count(*) FROM subscription_schema.subscription_invoice WHERE status IN ('PAYMENT_REQUESTED','PAYMENT_PENDING','FAILED')),
 'paymentOutboxPending', (SELECT count(*) FROM subscription_schema.subscription_payment_outbox WHERE status IN ('PENDING','FAILED','PROCESSING')),
 'paymentOutboxDead', (SELECT count(*) FROM subscription_schema.subscription_payment_outbox WHERE status='DEAD_LETTER'),
 'paymentInboxFailed', (SELECT count(*) FROM subscription_schema.subscription_payment_status_inbox WHERE processing_status IN ('FAILED','REJECTED')),
 'orderOutboxPending', (SELECT count(*) FROM subscription_schema.subscription_order_request_outbox WHERE status IN ('PENDING','FAILED','PROCESSING')),
 'orderOutboxDead', (SELECT count(*) FROM subscription_schema.subscription_order_request_outbox WHERE status='DEAD_LETTER'));
"""
}
FIELDS = {name: set(re.findall(r"^\s*'([A-Za-z][A-Za-z0-9]+)'\s*,", sql, re.MULTILINE))
          for name, sql in QUERIES.items()}


def validate_refund(data):
    enums = {'paymentProvider': {'RAZORPAY','CASHFREE'}, 'paymentEnvironment': {'PRODUCTION','SANDBOX'},
             'dispatchProtocol': {'RAZORPAY_REFUND_IDEMPOTENCY_V1'}}
    for key, value in data.items():
        if key in enums:
            if value not in enums[key]: raise ValueError('Unexpected refund protocol metadata')
        elif key.endswith('Count'):
            if type(value) is not int or not 0 <= value < 2**63: raise ValueError('Invalid refund count')
        elif type(value) is not bool:
            raise ValueError('Unexpected refund readiness field')
    required = {'providerExecutionReady','providerExecutionEligible','unknownOutcomeCount',
                'historicalModeMismatchCount','executableRefundCount','reconciliationReady'}
    if not required.issubset(data): raise ValueError('Missing refund readiness fields')
    return data


def capture():
    history = ops.history
    history.require(history.az('account','show').get('id') == history.SUB, 'Unexpected subscription')
    servers = history.az('postgres','flexible-server','list','-g',history.RG)
    ops.QUERIES = QUERIES
    ops.FIELDS = FIELDS
    history.APPS['subscription-service'] = ('ca-craves-subscription-service-p','subscription_schema')
    # The existing credential resolver and SQL helper enforce scoped vaults,
    # TLS, read-only transactions, deadlines, and aggregate-only result fields.
    results = []
    for service in QUERIES:
        try: results.append(ops.capture_service(service,servers))
        except Exception as error:
            # Only our fixed error categories, never database/provider exception text.
            safe_errors = {'Unexpected aggregate fields':'AGGREGATE_SHAPE',
                           'Read-only email aggregate unavailable; no write attempted':'AGGREGATE_QUERY',
                           'Runtime changed during inspection':'RUNTIME_CHANGED',
                           'Service deployment not settled':'DEPLOYMENT_UNSETTLED'}
            reason=safe_errors.get(str(error),'READ_DEPENDENCY_UNAVAILABLE') if isinstance(error,ValueError) else 'READ_DEPENDENCY_UNAVAILABLE'
            results.append({'service':service,'status':'READ_UNAVAILABLE_NO_WRITE_ATTEMPTED','reason':reason})
    # Reuse only read helpers; reject every mutating Azure command family.
    refund.az = history.az
    app = refund.show()
    state = validate_refund(refund.readiness(app))
    history.require(refund.show() == app,'Refund runtime changed during inspection')
    return {'readOnly':True,'refund':state,'observations':results,
            'limitation':'Counts do not prove an exercised payment, delivery or recovery journey.'}


if __name__ == '__main__':
    try: print(json.dumps(capture(),sort_keys=True))
    except Exception:
        print('CORE_READINESS_UNAVAILABLE_DETAILS_SUPPRESSED',file=sys.stderr)
        raise SystemExit(1)
