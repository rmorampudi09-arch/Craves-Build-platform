from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one match, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


def append_after(path: str, anchor: str, addition: str) -> None:
    replace_once(path, anchor, anchor + addition)


# 1) Keep existing legacy Biriyani data editable while presenting/submitting Biryani.
chef_form = "apps/mobile/src/features/chefMenu/domain/chefMenuForm.ts"
append_after(
    chef_form,
    "const optionalPositiveIntegerText = (invalidMessage: string) =>\n  z.string().refine(value => {\n    const normalized = value.trim();\n    return (\n      normalized.length === 0 ||\n      (/^[1-9]\\d*$/.test(normalized) && Number.isSafeInteger(Number(normalized)))\n    );\n  }, invalidMessage);\n",
    "\nfunction normalizeMenuCategory(value: string): string {\n  const normalized = value.trim();\n  return normalized.toLocaleLowerCase() === 'biriyani' ? 'Biryani' : normalized;\n}\n",
)
replace_once(chef_form, "    category: parsed.category,\n", "    category: normalizeMenuCategory(parsed.category),\n")
replace_once(chef_form, "    category: item.category,\n", "    category: normalizeMenuCategory(item.category),\n")

# 2) Home category selection always restarts at the first filtered item and keeps sticky results stable.
home = "apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx"
replace_once(home, "import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';\n", "")
replace_once(
    home,
    "import type {\n  CustomerHomeStackParamList,\n  CustomerTabParamList,\n} from '../../../app/navigation/types';\n",
    "import type {CustomerHomeStackParamList} from '../../../app/navigation/types';\n",
)
replace_once(home, "  const {width, fontScale} = useWindowDimensions();\n", "  const {width, height, fontScale} = useWindowDimensions();\n")
append_after(
    home,
    "  const resetSearchPosition = useCallback(() => {\n    restorePendingRef.current = false;\n    listRef.current?.scrollToOffset({offset: 0, animated: false});\n  }, []);\n",
    "\n  const handleCategorySelect = useCallback((category: string | null) => {\n    restorePendingRef.current = false;\n    listRef.current?.scrollToIndex({\n      index: 0,\n      animated: false,\n      viewPosition: 0,\n    });\n    setSelectedCategory(category);\n  }, []);\n",
)
replace_once(
    home,
    "  const openSubscription = useCallback(() => {\n    const tabs = navigation.getParent<BottomTabNavigationProp<CustomerTabParamList>>();\n    tabs?.navigate('Profile', {screen: 'CustomerSettingsSubscription'});\n  }, [navigation]);\n",
    "  const openSubscription = useCallback(() => {\n    navigation.navigate('CustomerSettingsSubscription');\n  }, [navigation]);\n",
)
replace_once(home, "                    onSelect={setSelectedCategory}\n", "                    onSelect={handleCategorySelect}\n")
replace_once(
    home,
    "            if (item.kind === 'empty') {\n              return emptyState;\n            }\n",
    "            if (item.kind === 'empty') {\n              return (\n                <View style={[styles.emptyResultSpace, {minHeight: height}]}>\n                  {emptyState}\n                </View>\n              );\n            }\n",
)
replace_once(
    home,
    "  stickyCategoryWrap: {\n    backgroundColor: colors.surfaceBase,\n    zIndex: 10,\n  },\n",
    "  stickyCategoryWrap: {\n    backgroundColor: colors.surfaceBase,\n    zIndex: 10,\n    elevation: 10,\n  },\n  emptyResultSpace: {\n    backgroundColor: colors.surfaceBase,\n  },\n",
)

# 3) Register Notifications locally in every customer stack and Subscription directly in Home.
types = "apps/mobile/src/app/navigation/types.ts"
replace_once(
    types,
    "export type CustomerHomeStackParamList = {\n  CustomerHomeRoot: undefined;\n  CustomerHomeSearch: undefined;\n  CustomerNotifications: undefined;\n  CustomerFilterSort: CustomerFilterSortRouteParams;\n}",
    "export type CustomerHomeStackParamList = {\n  CustomerHomeRoot: undefined;\n  CustomerHomeSearch: undefined;\n  CustomerNotifications: undefined;\n  CustomerSettingsSubscription: undefined;\n  CustomerFilterSort: CustomerFilterSortRouteParams;\n}",
)
replace_once(
    types,
    "export type CustomerChefsStackParamList = {\n  CustomerChefsRoot: undefined;\n  CustomerFilterSort: CustomerFilterSortRouteParams;\n} & CustomerDishDetailStackParamList &\n  CustomerCartStackParamList &\n  CustomerPaymentMethodsStackParamList;\n",
    "export type CustomerChefsStackParamList = {\n  CustomerChefsRoot: undefined;\n  CustomerNotifications: undefined;\n  CustomerFilterSort: CustomerFilterSortRouteParams;\n} & CustomerDishDetailStackParamList &\n  CustomerOrderDetailStackParamList &\n  CustomerCartStackParamList &\n  CustomerPaymentMethodsStackParamList;\n",
)
replace_once(
    types,
    "export type CustomerOrdersStackParamList = {\n  CustomerOrdersRoot: undefined;\n} & CustomerOrderDetailStackParamList &\n  CustomerCartStackParamList &\n  CustomerPaymentMethodsStackParamList;\n",
    "export type CustomerOrdersStackParamList = {\n  CustomerOrdersRoot: undefined;\n  CustomerNotifications: undefined;\n} & CustomerDishDetailStackParamList &\n  CustomerOrderDetailStackParamList &\n  CustomerCartStackParamList &\n  CustomerPaymentMethodsStackParamList;\n",
)

navigator = "apps/mobile/src/app/navigation/CustomerRootNavigator.tsx"
replace_once(
    navigator,
    "      <HomeStack.Screen name=\"CustomerNotifications\" component={CustomerNotificationsRouteScreen} />\n      <HomeStack.Screen name=\"CustomerFilterSort\" component={CustomerFilterSortScreen} />\n",
    "      <HomeStack.Screen name=\"CustomerNotifications\" component={CustomerNotificationsRouteScreen} />\n      <HomeStack.Screen name=\"CustomerSettingsSubscription\" component={CustomerSettingsSubscriptionScreen} />\n      <HomeStack.Screen name=\"CustomerFilterSort\" component={CustomerFilterSortScreen} />\n",
)
replace_once(
    navigator,
    "      <ChefsStack.Screen name=\"CustomerChefsRoot\" component={DiscoverHomeChefsRouteScreen} listeners={rootListeners} />\n      <ChefsStack.Screen name=\"CustomerFilterSort\" component={CustomerFilterSortScreen} />\n",
    "      <ChefsStack.Screen name=\"CustomerChefsRoot\" component={DiscoverHomeChefsRouteScreen} listeners={rootListeners} />\n      <ChefsStack.Screen name=\"CustomerNotifications\" component={CustomerNotificationsRouteScreen} />\n      <ChefsStack.Screen name=\"CustomerFilterSort\" component={CustomerFilterSortScreen} />\n",
)
replace_once(
    navigator,
    "      <ChefsStack.Screen name=\"CustomerKitchenDishes\" component={CustomerKitchenDishesScreen} />\n      <ChefsStack.Screen name=\"CustomerCart\" component={CustomerCartScreen} />\n",
    "      <ChefsStack.Screen name=\"CustomerKitchenDishes\" component={CustomerKitchenDishesScreen} />\n      <ChefsStack.Screen name=\"CustomerOrderDetail\" component={CustomerOrderDetailScreen} />\n      <ChefsStack.Screen name=\"CustomerOrderTracking\" component={CustomerOrderTrackingScreen} />\n      <ChefsStack.Screen name=\"CustomerCart\" component={CustomerCartScreen} />\n",
)
replace_once(
    navigator,
    "      <OrdersStack.Screen name=\"CustomerOrdersRoot\" component={CustomerOrdersRouteScreen} listeners={rootListeners} />\n      <OrdersStack.Screen name=\"CustomerOrderDetail\" component={CustomerOrderDetailScreen} />\n",
    "      <OrdersStack.Screen name=\"CustomerOrdersRoot\" component={CustomerOrdersRouteScreen} listeners={rootListeners} />\n      <OrdersStack.Screen name=\"CustomerNotifications\" component={CustomerNotificationsRouteScreen} />\n      <OrdersStack.Screen name=\"CustomerDishDetail\" component={CustomerDishDetailScreen} />\n      <OrdersStack.Screen name=\"CustomerDishIngredients\" component={CustomerDishIngredientsScreen} />\n      <OrdersStack.Screen name=\"CustomerKitchenProfile\" component={CustomerKitchenProfileScreen} />\n      <OrdersStack.Screen name=\"CustomerKitchenDishes\" component={CustomerKitchenDishesScreen} />\n      <OrdersStack.Screen name=\"CustomerOrderDetail\" component={CustomerOrderDetailScreen} />\n",
)

# 4) Bell never switches to Profile; it pushes Notifications inside the current stack.
header_hook = "apps/mobile/src/features/customerShell/hooks/useCustomerHeaderState.ts"
replace_once(header_hook, "import type {CustomerTabParamList} from '../../../app/navigation/types';\n", "")
replace_once(
    header_hook,
    "  const openNotifications = useCallback(() => {\n    if (navigation.getState().routeNames.includes('CustomerNotifications')) {\n      navigation.navigate('CustomerNotifications');\n      return;\n    }\n\n    const tabs = navigation.getParent<NavigationProp<CustomerTabParamList>>();\n    if (tabs) {\n      tabs.navigate('Profile', {screen: 'CustomerNotifications'});\n      return;\n    }\n    notificationsQuery.refetch().catch(() => undefined);\n  }, [navigation, notificationsQuery]);\n",
    "  const openNotifications = useCallback(() => {\n    if (navigation.getState().routeNames.includes('CustomerNotifications')) {\n      navigation.navigate('CustomerNotifications');\n      return;\n    }\n    notificationsQuery.refetch().catch(() => undefined);\n  }, [navigation, notificationsQuery]);\n",
)

notifications = "apps/mobile/src/features/notifications/screens/CustomerNotificationsScreen.tsx"
replace_once(
    notifications,
    "import {useNavigation} from '@react-navigation/native';\nimport type {NativeStackNavigationProp} from '@react-navigation/native-stack';\n",
    "import {\n  useNavigation,\n  type NavigationProp,\n  type ParamListBase,\n} from '@react-navigation/native';\n",
)
replace_once(notifications, "import type {CustomerProfileStackParamList} from '../../../app/navigation/types';\n", "")
replace_once(
    notifications,
    "type NotificationsNavigation = NativeStackNavigationProp<\n  CustomerProfileStackParamList,\n  'CustomerNotifications'\n>;\n",
    "type NotificationsNavigation = NavigationProp<ParamListBase>;\n",
)

notifications_route = "apps/mobile/src/features/notifications/screens/CustomerNotificationsRouteScreen.tsx"
replace_once(
    notifications_route,
    "import {useNavigation} from '@react-navigation/native';\nimport type {NativeStackNavigationProp} from '@react-navigation/native-stack';\n",
    "import {\n  useNavigation,\n  type NavigationProp,\n  type ParamListBase,\n} from '@react-navigation/native';\n",
)
replace_once(notifications_route, "import type {CustomerProfileStackParamList} from '../../../app/navigation/types';\n", "")
replace_once(
    notifications_route,
    "  const navigation =\n    useNavigation<\n      NativeStackNavigationProp<\n        CustomerProfileStackParamList,\n        'CustomerNotifications'\n      >\n    >();\n",
    "  const navigation = useNavigation<NavigationProp<ParamListBase>>();\n",
)

# Meal Plans is reused directly from Home and still keeps its explicit back button.
meal_plans = "apps/mobile/src/features/customerSubscription/screens/CustomerMealPlansScreen.tsx"
replace_once(
    meal_plans,
    "import {useNavigation} from '@react-navigation/native';\nimport type {NativeStackNavigationProp} from '@react-navigation/native-stack';\nimport type {CustomerProfileStackParamList} from '../../../app/navigation/types';\n",
    "import {\n  useNavigation,\n  type NavigationProp,\n  type ParamListBase,\n} from '@react-navigation/native';\n",
)
replace_once(meal_plans, "type Navigation = NativeStackNavigationProp<CustomerProfileStackParamList>;\n", "type Navigation = NavigationProp<ParamListBase>;\n")

# 5) View Details is immersive: no customer bottom menu.
policy = "apps/mobile/src/app/navigation/navigationPolicy.ts"
replace_once(
    policy,
    "  'CustomerKitchenDishes',\n  'CustomerCart',\n",
    "  'CustomerKitchenDishes',\n  'CustomerOrderDetail',\n  'CustomerCart',\n",
)

# 6) Match requested order-detail progress, compact ETA, chef circle and real item images.
order_detail = "apps/mobile/src/features/customerOrders/screens/CustomerOrderDetailScreen.tsx"
replace_once(
    order_detail,
    "import {ScreenShell} from '../../../shared/components/ScreenShell';\n",
    "import {ScreenShell} from '../../../shared/components/ScreenShell';\nimport {CustomerChefAvatar} from '../../customerShell/components/CustomerChefAvatar';\nimport {CustomerOrderMenuItemImage} from '../components/CustomerOrderMenuItemImage';\n",
)
replace_once(
    order_detail,
    "const PROGRESS_STEPS: readonly ProgressStep[] = [\n  {label: 'Preparing', icon: 'orders'},\n  {label: 'On the way', icon: 'delivery'},\n  {label: 'Out for delivery', icon: 'delivery'},\n  {label: 'Delivered', icon: 'check'},\n];\n",
    "const PROGRESS_STEPS: readonly ProgressStep[] = [\n  {label: 'Awaiting chef', icon: 'clock'},\n  {label: 'Chef accepted', icon: 'chef'},\n  {label: 'Items picked up', icon: 'delivery'},\n  {label: 'Delivered', icon: 'check'},\n];\n",
)
replace_once(
    order_detail,
    "    case 'OUT_FOR_DELIVERY':\n      return 2;\n    case 'READY_FOR_PICKUP':\n      return 1;\n    case 'PAYMENT_PENDING':\n    case 'PAID':\n    case 'CHEF_ACCEPTANCE_PENDING':\n    case 'CHEF_ACCEPTED':\n    case 'PREPARING':\n      return 0;\n",
    "    case 'OUT_FOR_DELIVERY':\n      return 2;\n    case 'CHEF_ACCEPTED':\n    case 'PREPARING':\n    case 'READY_FOR_PICKUP':\n      return 1;\n    case 'PAYMENT_PENDING':\n    case 'PAID':\n    case 'CHEF_ACCEPTANCE_PENDING':\n      return 0;\n",
)
append_after(
    order_detail,
    "function deliveryTimeCopy(order: CustomerOrder, canTrack: boolean): string {\n  if (order.status === 'DELIVERED') return 'Delivered';\n  if (canTrack) return 'Live delivery updates available';\n  if (order.prepTimeMinutes) return `Preparation estimate: ${order.prepTimeMinutes} min`;\n  return 'Delivery estimate unavailable';\n}\n",
    "\nfunction compactDuration(minutes: number | null): string | null {\n  if (!minutes || minutes <= 0) return null;\n  const hours = Math.floor(minutes / 60);\n  const remainder = minutes % 60;\n  if (hours === 0) return `${minutes}m`;\n  if (remainder === 0) return `${hours}h`;\n  return `${hours}h${remainder}m`;\n}\n",
)
replace_once(
    order_detail,
    "  const paymentStatus = paymentStatusForOrder(order);\n",
    "  const paymentStatus = paymentStatusForOrder(order);\n  const compactEstimate = compactDuration(order.prepTimeMinutes);\n",
)
replace_once(
    order_detail,
    "              <View style={styles.kitchenIdentity}>\n                <Text numberOfLines={2} style={styles.kitchenName}>\n                  {order.kitchenName}\n                </Text>\n                <Text style={styles.kitchenCaption}>Home kitchen</Text>\n              </View>\n",
    "              <View style={styles.kitchenIdentity}>\n                <CustomerChefAvatar size={48} />\n                <Text numberOfLines={2} style={styles.kitchenName}>\n                  {order.kitchenName}\n                </Text>\n              </View>\n",
)
replace_once(
    order_detail,
    "              <View style={styles.statusCopy}>\n                <Text accessibilityLiveRegion=\"polite\" style={styles.statusTitle}>\n                  {status.label}\n                </Text>\n                <Text style={styles.statusDetail}>\n                  {order.prepTimeMinutes\n                    ? `Preparation estimate: ${order.prepTimeMinutes} min`\n                    : `Updated ${formatCustomerOrderCreatedAt(order.updatedAt)}`}\n                </Text>\n              </View>\n              {detail.isFetching ? (\n",
    "              <View style={styles.statusCopy}>\n                <Text accessibilityLiveRegion=\"polite\" style={styles.statusTitle}>\n                  {status.label}\n                </Text>\n              </View>\n              {compactEstimate ? (\n                <Text style={styles.kitchenEta}>{compactEstimate}</Text>\n              ) : null}\n              {detail.isFetching ? (\n",
)
replace_once(
    order_detail,
    "                <View style={styles.itemThumb}>\n                  <Icon name=\"chef\" size={24} color={colors.flameRed} surface={false} />\n                </View>\n",
    "                <CustomerOrderMenuItemImage\n                  menuItemId={item.menuItemId}\n                  size={68}\n                />\n",
)
replace_once(
    order_detail,
    "  kitchenIdentity: {minWidth: 0, flex: 0.85, alignItems: 'flex-end'},\n",
    "  kitchenIdentity: {\n    minWidth: 0,\n    flex: 0.85,\n    flexDirection: 'row',\n    alignItems: 'center',\n    justifyContent: 'flex-end',\n    gap: spacing.sm,\n  },\n",
)
replace_once(
    order_detail,
    "  kitchenName: {\n    color: colors.espressoBrown,\n    fontSize: typography.body,\n    fontWeight: fontWeight.bold,\n    textAlign: 'right',\n  },\n  kitchenCaption: {\n    marginTop: spacing.xxs,\n    color: colors.textSecondary,\n    fontSize: typography.tiny,\n    textAlign: 'right',\n  },\n",
    "  kitchenName: {\n    minWidth: 0,\n    flex: 1,\n    color: colors.espressoBrown,\n    fontSize: typography.body,\n    fontWeight: fontWeight.bold,\n    textAlign: 'right',\n  },\n  kitchenEta: {\n    flexShrink: 0,\n    color: colors.espressoBrown,\n    fontSize: typography.heading,\n    fontWeight: fontWeight.bold,\n    textAlign: 'right',\n  },\n",
)

# 7) Android native Alert dialogs: white rounded card and Flame Red actions.
styles_xml = "apps/mobile/android/app/src/main/res/values/styles.xml"
replace_once(
    styles_xml,
    "        <item name=\"android:windowSplashScreenIconBackgroundColor\">#FFF7F1</item>\n    </style>\n\n</resources>\n",
    "        <item name=\"android:windowSplashScreenIconBackgroundColor\">#FFF7F1</item>\n        <item name=\"android:alertDialogTheme\">@style/CravesAlertDialogTheme</item>\n        <item name=\"alertDialogTheme\">@style/CravesAlertDialogTheme</item>\n    </style>\n\n    <style name=\"CravesAlertDialogTheme\" parent=\"Theme.AppCompat.Light.Dialog.Alert\">\n        <item name=\"android:windowBackground\">@drawable/craves_alert_background</item>\n        <item name=\"android:colorAccent\">#F62E18</item>\n        <item name=\"colorAccent\">#F62E18</item>\n        <item name=\"android:textColorPrimary\">#261A15</item>\n        <item name=\"android:textColorSecondary\">#706864</item>\n    </style>\n\n</resources>\n",
)

drawable = Path("apps/mobile/android/app/src/main/res/drawable/craves_alert_background.xml")
if drawable.exists():
    raise RuntimeError(f"{drawable}: already exists")
drawable.write_text("""<shape xmlns:android=\"http://schemas.android.com/apk/res/android\" android:shape=\"rectangle\">\n    <solid android:color=\"#FFFFFF\" />\n    <corners android:radius=\"20dp\" />\n    <padding\n        android:left=\"4dp\"\n        android:top=\"4dp\"\n        android:right=\"4dp\"\n        android:bottom=\"4dp\" />\n</shape>\n""")

# Add focused regression coverage for the renamed category while old server data remains readable.
home_test = "apps/mobile/src/features/home/homePresentation.test.ts"
append_after(
    home_test,
    "    expect(filterHomeDishes([paneer, dosa], 'south', null)).toEqual([dosa]);\n    expect(filterHomeDishes([paneer, dosa], '', 'Bowls')).toEqual([paneer]);\n",
    "    const legacyBiryani = dish({\n      id: '44444444-4444-4444-8444-444444444444',\n      itemName: 'Chicken Biryani',\n      category: 'Biriyani',\n    });\n    expect(filterHomeDishes([legacyBiryani], '', 'Biryani')).toEqual([legacyBiryani]);\n",
)

print('Applied mobile testing round 2 patch successfully.')
