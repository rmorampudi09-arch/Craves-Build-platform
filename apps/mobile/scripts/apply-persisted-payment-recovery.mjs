import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(mobileRoot, '..', '..');
const cartPath = path.resolve(
  repoRoot,
  'apps/mobile/src/features/cart/screens/CustomerCartScreen.tsx',
);

function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one target, found ${count}`);
  }
  return source.replace(from, to);
}

let source = fs.readFileSync(cartPath, 'utf8');

source = replaceOnce(
  source,
  `  ActivityIndicator,\n  Alert,\n  Image,\n`,
  `  ActivityIndicator,\n  Alert,\n  AppState,\n  Image,\n`,
  'react-native AppState import',
);

source = replaceOnce(
  source,
  `import {paymentHandoffCoordinator} from '../../payment/domain/paymentHandoffCoordinator';\nimport {paymentRecoveryCoordinator} from '../../payment/domain/paymentRecoveryCoordinator';\nimport {razorpayGateway} from '../../payment/gateway/razorpayGateway';\n`,
  `import {paymentHandoffCoordinator} from '../../payment/domain/paymentHandoffCoordinator';\nimport {\n  clearPersistedPaymentIfTerminal,\n  recoverPersistedPaymentAttempt,\n} from '../../payment/domain/persistedPaymentRecovery';\nimport {paymentRecoveryCoordinator} from '../../payment/domain/paymentRecoveryCoordinator';\nimport {razorpayGateway} from '../../payment/gateway/razorpayGateway';\nimport {pendingPaymentAttemptStore} from '../../payment/storage/pendingPaymentAttemptStore';\n`,
  'payment recovery imports',
);

source = replaceOnce(
  source,
  `  const [checkoutBusy, setCheckoutBusy] = useState(false);\n  const activeCheckoutRef = useRef<CheckoutSession | null>(null);\n`,
  `  const [checkoutBusy, setCheckoutBusy] = useState(false);\n  const [paymentAttemptLocked, setPaymentAttemptLocked] = useState(false);\n  const activeCheckoutRef = useRef<CheckoutSession | null>(null);\n  const persistedRecoveryRef = useRef<\n    ReturnType<typeof recoverPersistedPaymentAttempt> | null\n  >(null);\n`,
  'payment recovery state',
);

source = replaceOnce(
  source,
  `  const refreshCart = useCallback(async () => {\n    setRefreshError(null);\n    const outcome = await dispatch(refreshCartSnapshot());\n    if (outcome.status === 'FAILED') setRefreshError(outcome.error.message);\n  }, [dispatch]);\n\n  useEffect(() => {\n    if (snapshotStatus === 'UNINITIALIZED') refreshCart();\n  }, [refreshCart, snapshotStatus]);\n`,
  `  const refreshCart = useCallback(async () => {\n    setRefreshError(null);\n    const outcome = await dispatch(refreshCartSnapshot());\n    if (outcome.status === 'FAILED') setRefreshError(outcome.error.message);\n  }, [dispatch]);\n\n  const reconcileInterruptedPayment = useCallback(\n    (showSuccessAlert: boolean) => {\n      if (persistedRecoveryRef.current) return persistedRecoveryRef.current;\n\n      const task = (async () => {\n        try {\n          const recovery = await recoverPersistedPaymentAttempt();\n          if (!recovery) {\n            setPaymentAttemptLocked(false);\n            return null;\n          }\n\n          const active =\n            recovery.outcome === 'PENDING' || recovery.outcome === 'RECONCILING';\n          setPaymentAttemptLocked(active);\n          activeCheckoutRef.current =\n            recovery.outcome === 'PENDING' ? recovery.checkout : null;\n\n          if (recovery.outcome === 'SUCCEEDED') {\n            if (showSuccessAlert) {\n              Alert.alert(\n                'Payment successful',\n                'Your interrupted payment was verified by Craves.',\n              );\n            }\n            await refreshCart();\n          } else if (recovery.outcome === 'RECONCILING') {\n            setInteractionError(\n              'A previous payment is still being reconciled by Craves. Do not pay again until confirmation finishes.',\n            );\n          } else if (recovery.outcome === 'PENDING') {\n            setInteractionError(\n              'A previous payment is still pending. Craves will reuse the same payment if you continue.',\n            );\n          }\n          return recovery;\n        } catch (error) {\n          setPaymentAttemptLocked(true);\n          setInteractionError(\n            'Craves could not verify your previous payment yet. Do not start another payment until verification succeeds.',\n          );\n          throw error;\n        }\n      })();\n\n      persistedRecoveryRef.current = task;\n      void task\n        .finally(() => {\n          if (persistedRecoveryRef.current === task) persistedRecoveryRef.current = null;\n        })\n        .catch(() => undefined);\n      return task;\n    },\n    [refreshCart],\n  );\n\n  useEffect(() => {\n    if (snapshotStatus === 'UNINITIALIZED') refreshCart();\n  }, [refreshCart, snapshotStatus]);\n\n  useEffect(() => {\n    if (!checkoutBusy) {\n      void reconcileInterruptedPayment(true).catch(() => undefined);\n    }\n    const subscription = AppState.addEventListener('change', state => {\n      if (state === 'active' && !checkoutBusy) {\n        void reconcileInterruptedPayment(true).catch(() => undefined);\n      }\n    });\n    return () => subscription.remove();\n  }, [checkoutBusy, reconcileInterruptedPayment]);\n`,
  'interrupted payment reconciliation effect',
);

source = replaceOnce(
  source,
  `  const updateQuantity = useCallback(\n    (item: CartScreenItem, targetQuantity: number) => {\n      const interaction = resolveCartQuantityInteraction(targetQuantity);\n      setInteractionError(null);\n      activeCheckoutRef.current = null;\n`,
  `  const updateQuantity = useCallback(\n    (item: CartScreenItem, targetQuantity: number) => {\n      if (paymentAttemptLocked) {\n        setInteractionError(\n          'Your current payment must finish or fail before the cart can be changed.',\n        );\n        return;\n      }\n      const interaction = resolveCartQuantityInteraction(targetQuantity);\n      setInteractionError(null);\n      activeCheckoutRef.current = null;\n`,
  'cart mutation payment lock',
);

source = replaceOnce(
  source,
  `    [dispatch, handleMutationOutcome],\n  );\n\n  const handleCheckout = useCallback(async () => {\n`,
  `    [dispatch, handleMutationOutcome, paymentAttemptLocked],\n  );\n\n  const handleCheckout = useCallback(async () => {\n`,
  'cart mutation dependencies',
);

const oldCheckoutHandler = `  const handleCheckout = useCallback(async () => {\n    const addressId = header.selectedLocation?.addressId;\n    if (!model || !addressId || checkoutBusy) return;\n    setInteractionError(null);\n    setCheckoutBusy(true);\n    try {\n      const serviceable = await verifyServiceability();\n      if (!serviceable) {\n        setInteractionError(\n          \`This address is outside the \${DELIVERY_RADIUS_KM} km delivery area for one or more kitchens. Choose another address.\`,\n        );\n        return;\n      }\n\n      let checkout = activeCheckoutRef.current;\n      if (\n        !checkout ||\n        checkout.deliveryAddressId !== addressId ||\n        checkout.status !== 'PAYMENT_PENDING'\n      ) {\n        checkout = await checkoutApi.createSession({deliveryAddressId: addressId});\n        activeCheckoutRef.current = checkout;\n      }\n\n      const handoff = await paymentHandoffCoordinator.prepare(checkout);\n      try {\n        const proof = await razorpayGateway.open(handoff, {phone: authPhone});\n        const recovery = await paymentRecoveryCoordinator.recover(handoff, {\n          kind: 'RAZORPAY_SUCCESS',\n          proof,\n        });\n        activeCheckoutRef.current = recovery.checkout;\n\n        if (recovery.outcome === 'SUCCEEDED') {\n          activeCheckoutRef.current = null;\n          Alert.alert('Payment successful', 'Your payment was verified by Craves.');\n          await refreshCart();\n          return;\n        }\n        if (recovery.outcome === 'RECONCILING') {\n          setInteractionError(\n            'Your payment is being confirmed by Craves. Do not pay again. Check Orders shortly.',\n          );\n          return;\n        }\n        if (recovery.outcome === 'PENDING') {\n          setInteractionError(\n            'Payment is still pending. Do not start another payment until Craves finishes checking this one.',\n          );\n          return;\n        }\n        setInteractionError('Payment did not complete. You can safely retry this payment.');\n      } catch (paymentError) {\n        const recovery = await paymentRecoveryCoordinator\n          .recover(handoff, {kind: 'PROVIDER_ERROR'})\n          .catch(() => null);\n\n        if (recovery) {\n          activeCheckoutRef.current = recovery.checkout;\n          if (recovery.outcome === 'SUCCEEDED') {\n            activeCheckoutRef.current = null;\n            Alert.alert('Payment successful', 'Your payment was verified by Craves.');\n            await refreshCart();\n            return;\n          }\n          if (\n            recovery.verification.status === 'PAID' ||\n            recovery.outcome === 'RECONCILING'\n          ) {\n            setInteractionError(\n              'Craves has received the payment signal and is reconciling your order. Do not pay again.',\n            );\n            return;\n          }\n        }\n        throw paymentError;\n      }\n    } catch (error) {\n      const message =\n        error instanceof Error ? error.message : 'Checkout could not be started.';\n      setInteractionError(message);\n    } finally {\n      setCheckoutBusy(false);\n    }\n  }, [\n    authPhone,\n    checkoutBusy,\n    header.selectedLocation,\n    model,\n    refreshCart,\n    verifyServiceability,\n  ]);\n`;

const newCheckoutHandler = `  const handleCheckout = useCallback(async () => {\n    const addressId = header.selectedLocation?.addressId;\n    if (!model || !addressId || checkoutBusy) return;\n    setInteractionError(null);\n    setCheckoutBusy(true);\n    try {\n      const interrupted = await reconcileInterruptedPayment(false);\n      if (interrupted?.outcome === 'SUCCEEDED') return;\n      if (interrupted?.outcome === 'RECONCILING') {\n        setInteractionError(\n          'Your previous payment is still being reconciled. Do not create another payment yet.',\n        );\n        return;\n      }\n\n      let checkout =\n        interrupted?.outcome === 'PENDING'\n          ? interrupted.checkout\n          : activeCheckoutRef.current;\n      if (\n        checkout?.status === 'PAYMENT_PENDING' &&\n        checkout.deliveryAddressId !== addressId\n      ) {\n        setInteractionError(\n          'A payment is still pending for your previous delivery address. Keep that address until the payment finishes or fails.',\n        );\n        return;\n      }\n\n      const serviceable = await verifyServiceability();\n      if (!serviceable) {\n        setInteractionError(\n          \`This address is outside the \${DELIVERY_RADIUS_KM} km delivery area for one or more kitchens. Choose another address.\`,\n        );\n        return;\n      }\n\n      if (!checkout || checkout.status !== 'PAYMENT_PENDING') {\n        checkout = await checkoutApi.createSession({deliveryAddressId: addressId});\n        activeCheckoutRef.current = checkout;\n      }\n\n      const handoff = await paymentHandoffCoordinator.prepare(checkout);\n      await pendingPaymentAttemptStore.save(handoff);\n      setPaymentAttemptLocked(true);\n\n      try {\n        const proof = await razorpayGateway.open(handoff, {phone: authPhone});\n        const recovery = await paymentRecoveryCoordinator.recover(handoff, {\n          kind: 'RAZORPAY_SUCCESS',\n          proof,\n        });\n        await clearPersistedPaymentIfTerminal(recovery);\n        activeCheckoutRef.current =\n          recovery.outcome === 'PENDING' ? recovery.checkout : null;\n        setPaymentAttemptLocked(\n          recovery.outcome === 'PENDING' || recovery.outcome === 'RECONCILING',\n        );\n\n        if (recovery.outcome === 'SUCCEEDED') {\n          Alert.alert('Payment successful', 'Your payment was verified by Craves.');\n          await refreshCart();\n          return;\n        }\n        if (recovery.outcome === 'RECONCILING') {\n          setInteractionError(\n            'Your payment is being confirmed by Craves. Do not pay again. Check Orders shortly.',\n          );\n          return;\n        }\n        if (recovery.outcome === 'PENDING') {\n          setInteractionError(\n            'Payment is still pending. Continuing later will reuse this payment instead of creating a duplicate.',\n          );\n          return;\n        }\n        setInteractionError('Payment did not complete. You can safely try checkout again.');\n      } catch (paymentError) {\n        const recovery = await paymentRecoveryCoordinator\n          .recover(handoff, {kind: 'PROVIDER_ERROR'})\n          .catch(() => null);\n\n        if (recovery) {\n          await clearPersistedPaymentIfTerminal(recovery);\n          activeCheckoutRef.current =\n            recovery.outcome === 'PENDING' ? recovery.checkout : null;\n          setPaymentAttemptLocked(\n            recovery.outcome === 'PENDING' || recovery.outcome === 'RECONCILING',\n          );\n          if (recovery.outcome === 'SUCCEEDED') {\n            Alert.alert('Payment successful', 'Your payment was verified by Craves.');\n            await refreshCart();\n            return;\n          }\n          if (\n            recovery.verification.status === 'PAID' ||\n            recovery.outcome === 'RECONCILING'\n          ) {\n            setInteractionError(\n              'Craves has received the payment signal and is reconciling your order. Do not pay again.',\n            );\n            return;\n          }\n          if (recovery.outcome === 'PENDING') {\n            setInteractionError(\n              'Payment is still pending. Try checkout again to reopen the same payment safely.',\n            );\n            return;\n          }\n        } else {\n          setPaymentAttemptLocked(true);\n          setInteractionError(\n            'The payment provider closed, but Craves could not verify the payment state. Do not pay again until verification succeeds.',\n          );\n          return;\n        }\n        throw paymentError;\n      }\n    } catch (error) {\n      const message =\n        error instanceof Error ? error.message : 'Checkout could not be started.';\n      setInteractionError(message);\n    } finally {\n      setCheckoutBusy(false);\n    }\n  }, [\n    authPhone,\n    checkoutBusy,\n    header.selectedLocation,\n    model,\n    reconcileInterruptedPayment,\n    refreshCart,\n    verifyServiceability,\n  ]);\n`;

source = replaceOnce(
  source,
  oldCheckoutHandler,
  newCheckoutHandler,
  'production checkout handler',
);

source = replaceOnce(
  source,
  `        <DeliveryCard\n          address={header.selectedLocation?.displayName ?? null}\n          serviceability={serviceability}\n          estimatedMinutes={estimatedMinutes}\n          onChange={() => setLocationSelectorVisible(true)}\n        />\n`,
  `        <DeliveryCard\n          address={header.selectedLocation?.displayName ?? null}\n          serviceability={serviceability}\n          estimatedMinutes={estimatedMinutes}\n          onChange={() => {\n            if (paymentAttemptLocked) {\n              setInteractionError(\n                'Finish the current payment before changing the delivery address.',\n              );\n              return;\n            }\n            setLocationSelectorVisible(true);\n          }}\n        />\n`,
  'delivery address payment lock',
);

source = replaceOnce(
  source,
  `      pending={mutations[\`line:\${item.lineId}\`]?.status === 'PENDING'}\n`,
  `      pending={\n        paymentAttemptLocked ||\n        checkoutBusy ||\n        mutations[\`line:\${item.lineId}\`]?.status === 'PENDING'\n      }\n`,
  'line item payment lock',
);

source = replaceOnce(
  source,
  `      <CustomerHeader\n        variant="compact"\n        onPressLocation={() => setLocationSelectorVisible(true)}\n        onPressNotifications={() => header.refreshNotifications()}\n      />\n`,
  `      <CustomerHeader\n        variant="compact"\n        onPressLocation={() => {\n          if (paymentAttemptLocked) {\n            setInteractionError(\n              'Finish the current payment before changing the delivery address.',\n            );\n            return;\n          }\n          setLocationSelectorVisible(true);\n        }}\n        onPressNotifications={() => header.refreshNotifications()}\n      />\n`,
  'header location payment lock',
);

fs.writeFileSync(cartPath, source);
console.log('Persisted payment recovery migration applied.');
