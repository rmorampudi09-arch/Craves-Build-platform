import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {ChefDishFormScreen} from './ChefDishFormScreen';

/** The route keeps its name; the form is the same one the add route uses. */
export function ChefEditMenuItemScreen(props: NativeStackScreenProps<ChefProductStackParamList, 'ChefEditMenuItem'>) {
  return <ChefDishFormScreen mode="edit" {...props} />;
}
