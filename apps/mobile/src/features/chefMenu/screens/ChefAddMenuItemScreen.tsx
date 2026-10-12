import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {ChefDishFormScreen} from './ChefDishFormScreen';

/** The route keeps its name; the form is the same one the edit route uses. */
export function ChefAddMenuItemScreen(props: NativeStackScreenProps<ChefProductStackParamList, 'ChefAddMenuItem'>) {
  return <ChefDishFormScreen mode="add" {...props} />;
}
