import type {ImageSourcePropType} from 'react-native';

declare const require: (path: string) => ImageSourcePropType;

export const HOME_PROMO_BANNERS: readonly ImageSourcePropType[] = [
  require('./home-banner-1.jpg'),
  require('./home-banner-2.jpg'),
  require('./home-banner-3.jpg'),
];

export const HOME_KITCHEN_AVATARS: readonly ImageSourcePropType[] = [
  require('./kitchen-avatar-1.jpg'),
  require('./kitchen-avatar-2.jpg'),
  require('./kitchen-avatar-3.jpg'),
  require('./kitchen-avatar-4.jpg'),
  require('./kitchen-avatar-5.jpg'),
  require('./kitchen-avatar-6.jpg'),
];
