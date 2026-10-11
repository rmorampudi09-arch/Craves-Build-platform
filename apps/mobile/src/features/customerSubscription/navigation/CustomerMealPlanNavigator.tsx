import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import type {CustomerMealPlanStackParamList} from '../../../app/navigation/types';
import {resolveReducedMotionAnimation} from '../../../design/motion';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {MealPlanAddressScreen} from '../screens/MealPlanAddressScreen';
import {MealPlanDetailScreen} from '../screens/MealPlanDetailScreen';
import {MealPlanReviewScreen} from '../screens/MealPlanReviewScreen';
import {MealPlansScreen} from '../screens/MealPlansScreen';
import {MealPlanCheckoutProvider} from '../state/MealPlanCheckoutContext';

const Stack = createNativeStackNavigator<CustomerMealPlanStackParamList>();

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

// Tasks 5-6 replace these placeholders with the real screens.
const renderNothing = () => null;

export function CustomerMealPlanNavigator() {
  const screenOptions = useMealPlanStackScreenOptions();
  return (
    <MealPlanCheckoutProvider>
      <Stack.Navigator initialRouteName="MealPlans" screenOptions={screenOptions}>
        <Stack.Screen name="MealPlans" component={MealPlansScreen} />
        <Stack.Screen name="MealPlanDetail" component={MealPlanDetailScreen} />
        <Stack.Screen name="MealPlanReview" component={MealPlanReviewScreen} />
        <Stack.Screen name="MealPlanAddress" component={MealPlanAddressScreen} />
        <Stack.Screen name="MealPlanPayment" component={renderNothing} />
        <Stack.Screen name="MealPlanActivated" component={renderNothing} />
        <Stack.Screen name="MyMealPlan" component={renderNothing} />
        <Stack.Screen name="MealPlanMeal" component={renderNothing} />
      </Stack.Navigator>
    </MealPlanCheckoutProvider>
  );
}
