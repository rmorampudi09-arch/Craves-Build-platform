import type {ImageSourcePropType} from 'react-native';

export interface ChefAvatar {
  id: string;
  image: ImageSourcePropType;
}

// Metro bundles only literal require() paths, so each face is spelled out.
export const CHEF_AVATARS: readonly ChefAvatar[] = [
  {id: 'chef-avatar-01', image: require('../../../assets/chef-avatars/chef-avatar-01.jpg')},
  {id: 'chef-avatar-02', image: require('../../../assets/chef-avatars/chef-avatar-02.jpg')},
  {id: 'chef-avatar-03', image: require('../../../assets/chef-avatars/chef-avatar-03.jpg')},
  {id: 'chef-avatar-04', image: require('../../../assets/chef-avatars/chef-avatar-04.jpg')},
  {id: 'chef-avatar-05', image: require('../../../assets/chef-avatars/chef-avatar-05.jpg')},
  {id: 'chef-avatar-06', image: require('../../../assets/chef-avatars/chef-avatar-06.jpg')},
  {id: 'chef-avatar-07', image: require('../../../assets/chef-avatars/chef-avatar-07.jpg')},
  {id: 'chef-avatar-08', image: require('../../../assets/chef-avatars/chef-avatar-08.jpg')},
  {id: 'chef-avatar-09', image: require('../../../assets/chef-avatars/chef-avatar-09.jpg')},
  {id: 'chef-avatar-10', image: require('../../../assets/chef-avatars/chef-avatar-10.jpg')},
  {id: 'chef-avatar-11', image: require('../../../assets/chef-avatars/chef-avatar-11.jpg')},
  {id: 'chef-avatar-12', image: require('../../../assets/chef-avatars/chef-avatar-12.jpg')},
  {id: 'chef-avatar-13', image: require('../../../assets/chef-avatars/chef-avatar-13.jpg')},
  {id: 'chef-avatar-14', image: require('../../../assets/chef-avatars/chef-avatar-14.jpg')},
  {id: 'chef-avatar-15', image: require('../../../assets/chef-avatars/chef-avatar-15.jpg')},
  {id: 'chef-avatar-16', image: require('../../../assets/chef-avatars/chef-avatar-16.jpg')},
  {id: 'chef-avatar-17', image: require('../../../assets/chef-avatars/chef-avatar-17.jpg')},
  {id: 'chef-avatar-18', image: require('../../../assets/chef-avatars/chef-avatar-18.jpg')},
];

const AVATAR_URL = /\/(chef-avatar-\d{2})\.jpg(?:[?#].*)?$/;

/** The face a hosted picture link points to, or null when the link is not one of the 18 faces. */
export function chefAvatarIdFromUrl(url: string | null | undefined): string | null {
  const id = url?.match(AVATAR_URL)?.[1];
  return CHEF_AVATARS.some(avatar => avatar.id === id) ? (id as string) : null;
}
