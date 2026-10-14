import {CHEF_AVATARS, chefAvatarIdFromUrl} from './chefAvatars';

describe('chef avatars', () => {
  it('lists the 18 faces in order', () => {
    expect(CHEF_AVATARS.map(a => a.id)).toEqual(
      Array.from({length: 18}, (_, i) => `chef-avatar-${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('finds the face id at the end of a hosted URL', () => {
    expect(chefAvatarIdFromUrl('https://media.craves.in/public/chef-avatars/chef-avatar-04.jpg')).toBe('chef-avatar-04');
    expect(chefAvatarIdFromUrl('https://media.craves.in/public/chef-avatars/chef-avatar-04.jpg?v=2')).toBe('chef-avatar-04');
    expect(chefAvatarIdFromUrl('https://media.craves.in/public/chef-avatars/chef-avatar-19.jpg')).toBeNull();
    expect(chefAvatarIdFromUrl('https://media.craves.in/public/chef-avatars/chef-avatar-00.jpg')).toBeNull();
    expect(chefAvatarIdFromUrl('https://media.craves.in/public/kitchens/k1/chef/abc.jpg')).toBeNull();
    expect(chefAvatarIdFromUrl(null)).toBeNull();
    expect(chefAvatarIdFromUrl(undefined)).toBeNull();
  });
});
