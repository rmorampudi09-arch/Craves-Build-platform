INSERT INTO support_assistant_schema.knowledge_document
    (id, audience, title, source_type, source_ref, content, content_sha256, active, created_at, updated_at)
VALUES
(
    '10000000-0000-4000-8000-000000000001',
    'BOTH',
    'Keep your Craves account secure',
    'CURATED_HELP',
    'support/security/account-safety',
    'Craves support will never ask you to share your password, OTP, CVV, full card number, access token, API key, or private key. The self-support assistant cannot view secrets and cannot perform administrative actions. If anyone asks for these values while claiming to be Craves support, do not share them. Use the authenticated Support section in Craves for account-specific help.',
    '995df436d21ebb9ae0fcce25b4d816ee9c9f8af20a994381a28f3a9d77cd36de',
    TRUE,
    now(),
    now()
),
(
    '10000000-0000-4000-8000-000000000002',
    'CUSTOMER',
    'Check your own order status safely',
    'OPENAPI_SUMMARY',
    'order-service:/api/v1/orders/{orderId}',
    'For an authenticated customer, Craves can show an order that belongs to that customer and report the current order status. The self-support assistant may use an order ID supplied by the signed-in customer to read a reduced status summary through the Order Service. It does not receive the delivery address, phone number, payment credentials, or another customer''s order data. The assistant does not change order state, cancel an order, or issue a refund.',
    '9be0303a7773e96f564f8fb870f1373685be561ceaeafa11c1d3a3ee3a288dda',
    TRUE,
    now(),
    now()
),
(
    '10000000-0000-4000-8000-000000000003',
    'CUSTOMER',
    'Use your Craves support cases',
    'OPENAPI_SUMMARY',
    'user-chef-service:/api/v1/support/cases',
    'Authenticated customers can create support cases, list their own cases, view their own case details, and add requester messages. The self-support assistant may read only the status of a support case that the signed-in requester is authorized to view. If the assistant cannot confirm an issue safely, it should direct the customer to the Support section rather than invent an answer.',
    '119685e957e5a414b2d10b6e870ee35f64502ef58bc51ba78ad5c9a3f0382935',
    TRUE,
    now(),
    now()
),
(
    '10000000-0000-4000-8000-000000000004',
    'CHEF',
    'Chef order support is read-only',
    'OPENAPI_SUMMARY',
    'order-service:/api/v1/chef/orders/{orderId}',
    'An authenticated approved chef can view chef orders assigned to that chef. Current chef order workflows include accepting an eligible order with a preparation-time estimate, rejecting through the controlled order workflow, and marking an accepted order ready for pickup when allowed. The self-support assistant is read-only: it can explain status and guidance but cannot accept, reject, or mark an order ready on the chef''s behalf.',
    'd4a98fafb92edcf3c0eafd363ed07c7e4c5b75b61883e38f31ca2d6ecf60c099',
    TRUE,
    now(),
    now()
),
(
    '10000000-0000-4000-8000-000000000005',
    'CHEF',
    'Kitchen schedule and availability guidance',
    'CURATED_HELP',
    'catalog-service:kitchen-schedule-v1',
    'Craves supports chef kitchen schedule and availability information. The self-support assistant can explain the documented schedule and availability workflow from curated Craves help content. It must not invent opening hours, availability, delivery radius, pricing, commission, or compliance rules that are not present in approved Craves support knowledge.',
    '4c3622530f01c050cfcf9e25ac0e1dfe7d6a7860a9f120ff0e2801d0d58dacf6',
    TRUE,
    now(),
    now()
)
ON CONFLICT (id) DO NOTHING;
