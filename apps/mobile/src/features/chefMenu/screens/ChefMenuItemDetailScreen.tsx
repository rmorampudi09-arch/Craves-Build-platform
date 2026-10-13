import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {ChefProductStackParamList} from '../../../app/navigation/types';

/**
 * The read-only "Menu item" page is gone: tapping a dish opens its form. The route stays so
 * saved links and notifications that point at it still work; it hands over to the edit form.
 */
export function ChefMenuItemDetailScreen({navigation, route}: NativeStackScreenProps<ChefProductStackParamList, 'ChefMenuItemDetail'>) {
  const {menuItemId} = route.params;
  React.useEffect(() => {
    navigation.replace('ChefEditMenuItem', {menuItemId});
  }, [menuItemId, navigation]);
  return null;
}
