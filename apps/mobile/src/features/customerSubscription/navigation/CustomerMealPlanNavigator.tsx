import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import type {CustomerMealPlanStackParamList} from '../../../app/navigation/types';
import {resolveReducedMotionAnimation} from '../../../design/motion';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {MealPlanActivatedScreen} from '../screens/MealPlanActivatedScreen';
import {MealPlanAddressScreen} from '../screens/MealPlanAddressScreen';
import {MealPlanDetailScreen} from '../screens/MealPlanDetailScreen';
import {MealPlanHistoryScreen} from '../screens/MealPlanHistoryScreen';
import {MealPlanHowItWorksScreen} from '../screens/MealPlanHowItWorksScreen';
import {MealPlanMealScreen} from '../screens/MealPlanMealScreen';
import {MealPlanPaymentScreen} from '../screens/MealPlanPaymentScreen';
import {MealPlanReviewScreen} from '../screens/MealPlanReviewScreen';
import {MealPlansScreen} from '../screens/MealPlansScreen';
import {MyMealPlanScreen} from '../screens/MyMealPlanScreen';
import {MealPlanCheckoutProvider} from '../state/MealPlanCheckoutContext';

// shortcut: the two new routes are typed here until app/navigation/types.ts lists them; then drop this.
export type MealPlanStackParamList = CustomerMealPlanStackParamList & {
  MealPlanHistory: undefined;
  /** Static rules page; Help opens it by name. */
  MealPlanHowItWorks: undefined;
};

const Stack = createNativeStackNavigator<MealPlanStackParamList>();

// Same options as the customer tab stacks. They live in CustomerRootNavigator, which imports this
// navigator, so they are repeated here rather than imported (circular).
function useMealPlanStackScreenOptions() {
  const reduceMotionEnabled = useReducedMotionPreference();
  return React.useMemo(
    () => ({
      headerShown: false,
      animation: resolveReducedMotionAnimation('fade' as const, reduceMotionEnabled),
    }),
    [reduceMotionEnabled],
  );
}

export function CustomerMealPlanNavigator() {
  const screenOptions = useMealPlanStackScreenOptions();
  return (
    <MealPlanCheckoutProvider>
      <Stack.Navigator initialRouteName="MealPlans" screenOptions={screenOptions}>
        <Stack.Screen name="MealPlans" component={MealPlansScreen} />
        <Stack.Screen name="MealPlanDetail" component={MealPlanDetailScreen} />
        <Stack.Screen name="MealPlanReview" component={MealPlanReviewScreen} />
        <Stack.Screen name="MealPlanAddress" component={MealPlanAddressScreen} />
        <Stack.Screen name="MealPlanPayment" component={MealPlanPaymentScreen} />
        {/* No swipe back into a finished checkout; Android back is handled by the screen. */}
        <Stack.Screen
          name="MealPlanActivated"
          component={MealPlanActivatedScreen}
          options={{gestureEnabled: false}}
        />
        <Stack.Screen name="MyMealPlan" component={MyMealPlanScreen} />
        <Stack.Screen name="MealPlanMeal" component={MealPlanMealScreen} />
        <Stack.Screen name="MealPlanHistory" component={MealPlanHistoryScreen} />
        <Stack.Screen name="MealPlanHowItWorks" component={MealPlanHowItWorksScreen} />
      </Stack.Navigator>
    </MealPlanCheckoutProvider>
  );
}
