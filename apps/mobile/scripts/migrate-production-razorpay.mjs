import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(mobileRoot, '..', '..');

function replaceOnce(filePath, from, to) {
  const absolute = path.resolve(repoRoot, filePath);
  const current = fs.readFileSync(absolute, 'utf8');
  const occurrences = current.split(from).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${filePath}: expected exactly one migration target, found ${occurrences}`);
  }
  fs.writeFileSync(absolute, current.replace(from, to));
}

const cartPath = 'apps/mobile/src/features/cart/screens/CustomerCartScreen.tsx';

replaceOnce(
  cartPath,
  `import {CFEnvironment, CFSession} from 'cashfree-pg-api-contract';\nimport {\n  CFPaymentGatewayService,\n  type CFErrorResponse,\n} from 'react-native-cashfree-pg-sdk';\n`,
  '',
);

replaceOnce(
  cartPath,
  `import {checkoutApi} from '../../checkout/api/checkoutApi';\nimport {\n  paymentApi,\n  type MobilePaymentSession,\n} from '../../checkout/api/paymentApi';\n`,
  `import {checkoutApi} from '../../checkout/api/checkoutApi';\nimport type {CheckoutSession} from '../../checkout/domain/checkoutTypes';\nimport {paymentHandoffCoordinator} from '../../payment/domain/paymentHandoffCoordinator';\nimport {paymentRecoveryCoordinator} from '../../payment/domain/paymentRecoveryCoordinator';\nimport {razorpayGateway} from '../../payment/gateway/razorpayGateway';\n`,
);

replaceOnce(
  cartPath,
  `  const [checkoutBusy, setCheckoutBusy] = useState(false);\n  const paymentRef = useRef<MobilePaymentSession | null>(null);\n`,
  `  const [checkoutBusy, setCheckoutBusy] = useState(false);\n  const activeCheckoutRef = useRef<CheckoutSession | null>(null);\n`,
);

replaceOnce(
  cartPath,
  `  useEffect(() => {\n    CFPaymentGatewayService.setCallback({\n      onVerify: (cashfreeOrderId: string) => {\n        const current = paymentRef.current;\n        if (!current || current.cashfreeOrderId !== cashfreeOrderId) {\n          setInteractionError(\n            'Cashfree returned an unexpected order reference. Payment was not accepted.',\n          );\n          return;\n        }\n        setCheckoutBusy(true);\n        paymentApi\n          .verify(current.paymentOrderId)\n          .then(result => {\n            if (result.status === 'PAID') {\n              Alert.alert('Payment successful', 'Your payment was verified by Craves.');\n              paymentRef.current = null;\n              refreshCart();\n            } else {\n              setInteractionError(\n                'Payment is not verified as paid yet. Please try verification again.',\n              );\n            }\n          })\n          .catch(() =>\n            setInteractionError(\n              'Payment verification failed. No payment has been marked successful.',\n            ),\n          )\n          .finally(() => setCheckoutBusy(false));\n      },\n      onError: (_error: CFErrorResponse, cashfreeOrderId: string) => {\n        const current = paymentRef.current;\n        setInteractionError(\n          current?.cashfreeOrderId === cashfreeOrderId\n            ? 'Cashfree checkout did not complete. No payment was marked successful.'\n            : 'Cashfree returned an unexpected order reference.',\n        );\n      },\n    });\n    return () => CFPaymentGatewayService.removeCallback();\n  }, [refreshCart]);\n\n`,
  '',
);

replaceOnce(
  cartPath,
  `      setInteractionError(null);\n      if (interaction.kind === 'INVALID') {\n`,
  `      setInteractionError(null);\n      activeCheckoutRef.current = null;\n      if (interaction.kind === 'INVALID') {\n`,
);

replaceOnce(
  cartPath,
  `  const handleCheckout = useCallback(async () => {\n    if (!model || !header.selectedLocation?.addressId || checkoutBusy) return;\n    setInteractionError(null);\n    setCheckoutBusy(true);\n    try {\n      const serviceable = await verifyServiceability();\n      if (!serviceable) {\n        setInteractionError(\n          \`This address is outside the \${DELIVERY_RADIUS_KM} km delivery area for one or more kitchens. Choose another address.\`,\n        );\n        return;\n      }\n      const checkout = await checkoutApi.createSession({\n        deliveryAddressId: header.selectedLocation.addressId,\n      });\n      const payment = await paymentApi.createSession(checkout.checkoutId, authPhone);\n      paymentRef.current = payment;\n      const session = new CFSession(\n        payment.paymentSessionId,\n        payment.cashfreeOrderId,\n        CFEnvironment.SANDBOX,\n      );\n      CFPaymentGatewayService.doWebPayment(session);\n    } catch (error) {\n      const message =\n        error instanceof Error ? error.message : 'Checkout could not be started.';\n      setInteractionError(message);\n    } finally {\n      setCheckoutBusy(false);\n    }\n  }, [\n    authPhone,\n    checkoutBusy,\n    header.selectedLocation,\n    model,\n    verifyServiceability,\n  ]);\n`,
  `  const handleCheckout = useCallback(async () => {\n    const addressId = header.selectedLocation?.addressId;\n    if (!model || !addressId || checkoutBusy) return;\n    setInteractionError(null);\n    setCheckoutBusy(true);\n    try {\n      const serviceable = await verifyServiceability();\n      if (!serviceable) {\n        setInteractionError(\n          \`This address is outside the \${DELIVERY_RADIUS_KM} km delivery area for one or more kitchens. Choose another address.\`,\n        );\n        return;\n      }\n\n      let checkout = activeCheckoutRef.current;\n      if (\n        !checkout ||\n        checkout.deliveryAddressId !== addressId ||\n        checkout.status !== 'PAYMENT_PENDING'\n      ) {\n        checkout = await checkoutApi.createSession({deliveryAddressId: addressId});\n        activeCheckoutRef.current = checkout;\n      }\n\n      const handoff = await paymentHandoffCoordinator.prepare(checkout);\n      try {\n        const proof = await razorpayGateway.open(handoff, {phone: authPhone});\n        const recovery = await paymentRecoveryCoordinator.recover(handoff, {\n          kind: 'RAZORPAY_SUCCESS',\n          proof,\n        });\n        activeCheckoutRef.current = recovery.checkout;\n\n        if (recovery.outcome === 'SUCCEEDED') {\n          activeCheckoutRef.current = null;\n          Alert.alert('Payment successful', 'Your payment was verified by Craves.');\n          await refreshCart();\n          return;\n        }\n        if (recovery.outcome === 'RECONCILING') {\n          setInteractionError(\n            'Your payment is being confirmed by Craves. Do not pay again. Check Orders shortly.',\n          );\n          return;\n        }\n        if (recovery.outcome === 'PENDING') {\n          setInteractionError(\n            'Payment is still pending. Do not start another payment until Craves finishes checking this one.',\n          );\n          return;\n        }\n        setInteractionError('Payment did not complete. You can safely retry this payment.');\n      } catch (paymentError) {\n        const recovery = await paymentRecoveryCoordinator\n          .recover(handoff, {kind: 'PROVIDER_ERROR'})\n          .catch(() => null);\n\n        if (recovery) {\n          activeCheckoutRef.current = recovery.checkout;\n          if (recovery.outcome === 'SUCCEEDED') {\n            activeCheckoutRef.current = null;\n            Alert.alert('Payment successful', 'Your payment was verified by Craves.');\n            await refreshCart();\n            return;\n          }\n          if (\n            recovery.verification.status === 'PAID' ||\n            recovery.outcome === 'RECONCILING'\n          ) {\n            setInteractionError(\n              'Craves has received the payment signal and is reconciling your order. Do not pay again.',\n            );\n            return;\n          }\n        }\n        throw paymentError;\n      }\n    } catch (error) {\n      const message =\n        error instanceof Error ? error.message : 'Checkout could not be started.';\n      setInteractionError(message);\n    } finally {\n      setCheckoutBusy(false);\n    }\n  }, [\n    authPhone,\n    checkoutBusy,\n    header.selectedLocation,\n    model,\n    refreshCart,\n    verifyServiceability,\n  ]);\n`,
);

const methodsScreenPath =
  'apps/mobile/src/features/payment/screens/CustomerPaymentMethodsScreen.tsx';
replaceOnce(methodsScreenPath, "option.id === 'CASHFREE_ONLINE'", "option.id === 'RAZORPAY_ONLINE'");
replaceOnce(
  methodsScreenPath,
  'Online payment uses the existing Cashfree order and verification boundary. Payment success is accepted only after backend verification.',
  'Online payment uses the backend-issued Razorpay order. Payment success is accepted only after signed backend verification and checkout reconciliation.',
);

const manifestPath = 'api/apim-api/contracts/mobile-production.v1.json';
replaceOnce(
  manifestPath,
  '{"id":"payment.verifyOrder","source":"src/features/payment/api/paymentApi.ts","method":"POST","path":"/api/v1/payments/orders/{paymentOrderId}/verify","auth":"bearer","requestModel":"none","responseModel":"PaymentVerificationResult","requestValidator":"requireUuid","responseValidator":"requireVerificationResult + payment identity check"}',
  '{"id":"payment.verifyOrder","source":"src/features/payment/api/paymentApi.ts","method":"POST","path":"/api/v1/payments/orders/{paymentOrderId}/verify","auth":"bearer","requestModel":"RazorpayVerificationProof","responseModel":"PaymentVerificationResult","requestValidator":"requireUuid + requireVerificationProof + provider order binding","responseValidator":"requireVerificationResult + payment identity check"}',
);

const obsoleteCheckoutPaymentApi = path.resolve(
  repoRoot,
  'apps/mobile/src/features/checkout/api/paymentApi.ts',
);
if (!fs.existsSync(obsoleteCheckoutPaymentApi)) {
  throw new Error('Expected obsolete checkout payment API to exist before migration.');
}
fs.rmSync(obsoleteCheckoutPaymentApi);

console.log('Razorpay production migration applied successfully.');
