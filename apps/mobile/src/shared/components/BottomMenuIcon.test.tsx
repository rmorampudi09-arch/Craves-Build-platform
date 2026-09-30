import House from 'lucide-react-native/icons/house';
import ChefHat from 'lucide-react-native/icons/chef-hat';
import ClipboardList from 'lucide-react-native/icons/clipboard-list';
import UserRound from 'lucide-react-native/icons/user-round';
import { bottomMenu } from '../../design/tokens';
import { BottomMenuIcon } from './BottomMenuIcon';

describe('bottom menu outline icons', () => {
  it.each([
    ['home', House],
    ['chef', ChefHat],
    ['orders', ClipboardList],
    ['account', UserRound],
  ] as const)(
    'uses the reference outline for %s, retaining navigation tint and size',
    (name, component) => {
      const icon = BottomMenuIcon({
        name,
        size: 30,
        color: bottomMenu.activeColor,
      });
      expect(icon.type).toBe(component);
      expect(icon.props.color).toBe(bottomMenu.activeColor);
      expect(icon.props.size).toBe(30);
      expect(icon.props.strokeWidth).toBe(bottomMenu.iconStrokeWidth);
      expect(icon.props.accessibilityElementsHidden).toBe(true);
    },
  );
});
