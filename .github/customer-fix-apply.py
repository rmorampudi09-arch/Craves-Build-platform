from pathlib import Path
import re


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))


def replace_all_exact(path: str, old: str, new: str, expected: int):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected} matches, found {count}: {old[:100]!r}')
    p.write_text(text.replace(old, new))


def sub_once(path: str, pattern: str, replacement: str):
    p = Path(path)
    text = p.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{path}: regex expected one match, found {count}: {pattern[:100]!r}')
    p.write_text(updated)


home = 'apps/mobile/src/features/home/screens/CustomerHomeScreen.tsx'
replace_once(home, "    backgroundColor: 'rgba(255,255,255,0.78)',\n", "    backgroundColor: 'transparent',\n")
replace_once(
    home,
    "    backgroundColor: 'rgba(255,255,255,0.82)',\n    paddingHorizontal: spacing.sm,\n    paddingVertical: spacing.xs,\n",
    "    backgroundColor: 'transparent',\n    borderWidth: StyleSheet.hairlineWidth,\n    borderColor: 'rgba(255,255,255,0.78)',\n    paddingHorizontal: spacing.sm,\n    paddingVertical: spacing.xxs,\n",
)
replace_once(home, "  purchaseRow: {\n    flexDirection: 'row',\n    alignItems: 'flex-end',\n    justifyContent: 'space-between',\n    gap: spacing.sm,\n    marginTop: spacing.xs,\n  },\n", "  purchaseRow: {\n    flexDirection: 'row',\n    alignItems: 'center',\n    justifyContent: 'space-between',\n    gap: spacing.xs,\n    marginTop: spacing.xs,\n  },\n")
replace_once(home, "    flexWrap: 'wrap',\n    gap: spacing.sm,\n    paddingBottom: spacing.xxs,\n", "    flexWrap: 'nowrap',\n    gap: spacing.xs,\n    paddingBottom: 0,\n")
replace_once(home, "  addButton: {\n    minHeight: touchTarget.minimum,\n    minWidth: 104,\n    paddingHorizontal: spacing.md,\n  },\n", "  addButton: {\n    width: 132,\n    minWidth: 132,\n    maxWidth: 132,\n    minHeight: touchTarget.minimum,\n    flexShrink: 0,\n    paddingHorizontal: spacing.sm,\n  },\n")

profile = 'apps/mobile/src/features/kitchenProfile/screens/CustomerKitchenProfileScreen.tsx'
replace_once(profile, '  Image,\n', '')
replace_once(profile, "import {getDisplayAvailabilityCount} from '../../../shared/menuAvailability';\n", '')
replace_once(profile, "import {formatDishDetailPrice} from '../../dishDetail/dishDetailPurchase';\n", '')
replace_once(profile, "import {CustomerFavoriteHeartButton} from '../../favorites/components/CustomerFavoriteHeartButton';\n", '')
replace_once(profile, "import type {CustomerKitchenMenuItemSummary} from '../api/kitchenProfileApi';\n", "import type {CustomerKitchenMenuItemSummary} from '../api/kitchenProfileApi';\nimport {CustomerKitchenMenuCard} from '../components/CustomerKitchenMenuCard';\n")
replace_once(profile, '  getCustomerKitchenMenuImage,\n', '')
sub_once(profile, r"function foodTypeLabel\(.*?\nexport function CustomerKitchenProfileScreen", '''interface MenuPreviewCardProps {
  item: CustomerKitchenMenuItemSummary;
  cartLine: CartLine | null;
  busy: boolean;
  favorite: boolean;
  favoritePending: boolean;
  favoriteDisabled: boolean;
  onFavoriteToggle: (menuItemId: string, favorite: boolean) => void;
  onOpen: (menuItemId: string) => void;
  onIncrease: (item: CustomerKitchenMenuItemSummary) => void;
  onDecrease: (line: CartLine) => void;
}

function MenuPreviewCard(props: MenuPreviewCardProps) {
  return <CustomerKitchenMenuCard {...props} />;
}

export function CustomerKitchenProfileScreen''')
replace_once(profile, '<Text style={styles.previewPillText}>View all</Text>\n', '<Text style={styles.previewPillText}>View all</Text>\n                    <Icon name="chevron-right" size={18} color={colors.flameRedAccessible} surface={false} />\n')
replace_once(profile, "  previewPill: {\n    minHeight: touchTarget.minimum,\n    borderRadius: radius.pill,\n    backgroundColor: colors.white,\n    paddingHorizontal: spacing.sm,\n    paddingVertical: spacing.xs,\n    alignItems: 'center',\n    justifyContent: 'center',\n  },\n", "  previewPill: {\n    minHeight: touchTarget.minimum,\n    flexDirection: 'row',\n    alignItems: 'center',\n    justifyContent: 'center',\n    gap: spacing.xxs,\n    paddingHorizontal: spacing.xs,\n    backgroundColor: 'transparent',\n  },\n")
replace_once(profile, "  previewPillText: {\n    color: colors.flameRed,\n    fontSize: typography.tiny,\n    fontWeight: fontWeight.bold,\n  },\n", "  previewPillText: {\n    color: colors.flameRedAccessible,\n    fontSize: typography.small,\n    fontWeight: fontWeight.bold,\n  },\n")

dishes = 'apps/mobile/src/features/kitchenProfile/screens/CustomerKitchenDishesScreen.tsx'
replace_once(dishes, '  Image,\n', '')
replace_once(dishes, "import {formatDishDetailPrice} from '../../dishDetail/dishDetailPurchase';\n", '')
replace_once(dishes, "import {CustomerFavoriteHeartButton} from '../../favorites/components/CustomerFavoriteHeartButton';\n", '')
replace_once(dishes, "import type {CustomerKitchenMenuItemSummary} from '../api/kitchenProfileApi';\n", "import type {CustomerKitchenMenuItemSummary} from '../api/kitchenProfileApi';\nimport {CustomerKitchenMenuCard} from '../components/CustomerKitchenMenuCard';\n")
replace_once(dishes, '  formatCustomerKitchenDishMetadata,\n', '')
replace_once(dishes, "import {getCustomerKitchenMenuImage} from '../kitchenProfilePresentation';\n", '')
sub_once(dishes, r"function KitchenDishRow\(\{.*?\n\}\n\nfunction DishSeparator", '''function KitchenDishRow(props: KitchenDishRowProps) {
  return <CustomerKitchenMenuCard {...props} />;
}

function DishSeparator''')

nav = 'apps/mobile/src/app/navigation/CustomerRootNavigator.tsx'
replace_once(nav, '      <Tab.Screen name="Profile" component={CustomerProfileStackNavigator} options={profileTabOptions} />\n', '''      <Tab.Screen
        name="Profile"
        component={CustomerProfileStackNavigator}
        options={profileTabOptions}
        listeners={({navigation}) => ({
          tabPress: event => {
            showBottomNav();
            event.preventDefault();
            navigation.navigate('Profile', {screen: 'CustomerProfileRoot'});
          },
        })}
      />
''')

catalog = 'services/order-service/src/main/java/in/craves/order/service/CatalogClient.java'
replace_once(catalog, '    public record CatalogMenuItem(\n', '''    /**
     * The public active-menu-item endpoint already guarantees an ACTIVE kitchen.
     * Cart mutations only need a safe display snapshot; checkout keeps strict
     * kitchen lookup because pickup details are required there.
     */
    public CatalogKitchen getKitchenForVerifiedActiveMenuItem(CatalogMenuItem item) {
        if (item == null || item.kitchenId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Catalog item response is incomplete");
        }
        try {
            return getKitchen(item.kitchenId());
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode().value() == HttpStatus.BAD_REQUEST.value()
                && "Kitchen is not active".equals(ex.getReason())) {
                return fallbackKitchenForVerifiedActiveItem(item);
            }
            throw ex;
        }
    }

    static CatalogKitchen fallbackKitchenForVerifiedActiveItem(CatalogMenuItem item) {
        return new CatalogKitchen(item.kitchenId(), null, "Kitchen", null, null, null, "ACTIVE");
    }

    public record CatalogMenuItem(\n''')
order = 'services/order-service/src/main/java/in/craves/order/service/OrderService.java'
replace_all_exact(order, 'CatalogKitchen kitchen = catalogClient.getKitchen(item.kitchenId());', 'CatalogKitchen kitchen = catalogClient.getKitchenForVerifiedActiveMenuItem(item);', 2)

test_path = Path('services/order-service/src/test/java/in/craves/order/service/CatalogClientCartSnapshotTest.java')
test_path.write_text('''package in.craves.order.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CatalogClientCartSnapshotTest {
    @Test
    void verifiedActiveMenuItemCanProduceSafeCartKitchenSnapshot() {
        UUID kitchenId = UUID.fromString("11111111-1111-4111-8111-111111111111");
        CatalogClient.CatalogMenuItem item = new CatalogClient.CatalogMenuItem(
            UUID.fromString("22222222-2222-4222-8222-222222222222"), kitchenId,
            "Paneer curry", null, "Curry", "VEG", new BigDecimal("100.00"),
            "INR", 1, 30, "MEDIUM", true, "ACTIVE"
        );
        CatalogClient.CatalogKitchen snapshot = CatalogClient.fallbackKitchenForVerifiedActiveItem(item);
        assertEquals(kitchenId, snapshot.id());
        assertEquals("Kitchen", snapshot.kitchenName());
        assertEquals("ACTIVE", snapshot.status());
        assertNull(snapshot.identityId());
    }
}
''')
