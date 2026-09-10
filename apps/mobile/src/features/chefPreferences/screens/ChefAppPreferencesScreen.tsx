import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {ChefProfileStackParamList} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {ChefHeader} from '../../chefShell/components/ChefHeader';
import type {ChefPreferenceCapabilityKey} from '../domain/chefPreferencesContract';
import {
  CHEF_PREFERENCES_MODAL_CLOSED,
  closeChefPreferencesUnavailableModal,
  createChefPreferencesUiBoundary,
  getChefPreferencesUiItem,
  openChefPreferencesUnavailableModal,
  type ChefPreferencesUiItem,
  type ChefPreferencesUiSection,
  type ChefPreferencesUnavailableModalState,
} from '../domain/chefPreferencesUiBoundary';

type PreferencesNavigation = NativeStackNavigationProp<
  ChefProfileStackParamList,
  'ChefAppPreferences'
>;

function UnavailablePill() {
  return (
    <View accessibilityLabel="Unavailable" style={styles.unavailablePill}>
      <Text style={styles.unavailablePillText}>Unavailable</Text>
    </View>
  );
}

function DisabledToggle({label}: {label: string}) {
  return (
    <View
      accessibilityLabel={`${label}, current value unavailable`}
      accessibilityRole="switch"
      accessibilityState={{disabled: true}}
      style={styles.disabledToggle}>
      <View style={styles.disabledToggleThumb} />
    </View>
  );
}

function PreferenceRow({
  item,
  last,
  onExplain,
}: {
  item: ChefPreferencesUiItem;
  last: boolean;
  onExplain: (capability: ChefPreferenceCapabilityKey) => void;
}) {
  return (
    <Pressable
      accessibilityHint="Shows why this Chef preference cannot be changed yet"
      accessibilityLabel={`${item.label}, unavailable`}
      accessibilityRole="button"
      onPress={() => onExplain(item.capability)}
      style={({pressed}) => [
        styles.preferenceRow,
        !last && styles.preferenceRowBorder,
        pressed && styles.pressed,
      ]}>
      <View style={styles.preferenceCopy}>
        <Text style={styles.preferenceLabel}>{item.label}</Text>
        {item.helperText ? (
          <Text style={styles.preferenceHelper}>{item.helperText}</Text>
        ) : null}
      </View>
      {item.controlKind === 'toggle' ? (
        <View style={styles.trailingToggleWrap}>
          <UnavailablePill />
          <DisabledToggle label={item.label} />
        </View>
      ) : (
        <View style={styles.trailingRowWrap}>
          <UnavailablePill />
          <Icon name="chevron-right" size={iconSize.xs} color={colors.placeholder} />
        </View>
      )}
    </Pressable>
  );
}

function PreferenceSection({
  section,
  onExplain,
}: {
  section: ChefPreferencesUiSection;
  onExplain: (capability: ChefPreferenceCapabilityKey) => void;
}) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.sectionCard}>
        {section.items.map((item, index) => (
          <PreferenceRow
            item={item}
            key={item.capability}
            last={index === section.items.length - 1}
            onExplain={onExplain}
          />
        ))}
      </View>
    </View>
  );
}

export function ChefAppPreferencesScreen() {
  const navigation = useNavigation<PreferencesNavigation>();
  const boundary = React.useMemo(createChefPreferencesUiBoundary, []);
  const [modalState, setModalState] = React.useState<ChefPreferencesUnavailableModalState>(
    CHEF_PREFERENCES_MODAL_CLOSED,
  );

  const openUnavailable = React.useCallback((capability: ChefPreferenceCapabilityKey) => {
    setModalState(openChefPreferencesUnavailableModal(capability));
  }, []);

  const closeUnavailable = React.useCallback(() => {
    setModalState(closeChefPreferencesUnavailableModal());
  }, []);

  const activeItem = modalState.visible
    ? getChefPreferencesUiItem(boundary, modalState.capability)
    : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ChefHeader title="Preferences" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityLabel="Back to Chef profile"
          accessibilityRole="button"
          hitSlop={spacing.xs}
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.backButton, pressed && styles.pressed]}>
          <Icon name="arrow-left" size={iconSize.sm} color={colors.espressoBrown} />
          <Text style={styles.backText}>Profile</Text>
        </Pressable>

        <View accessibilityRole="alert" style={styles.contractBanner}>
          <View style={styles.contractIcon}>
            <Icon name="shield" size={iconSize.lg} color={colors.warning} />
          </View>
          <View style={styles.contractCopy}>
            <Text style={styles.contractTitle}>Preferences are protected for now</Text>
            <Text style={styles.contractText}>
              Craves does not yet have an approved Chef preference persistence contract. Controls stay unavailable instead of pretending a change was saved.
            </Text>
          </View>
        </View>

        {boundary.sections.map(section => (
          <PreferenceSection
            key={section.id}
            section={section}
            onExplain={openUnavailable}
          />
        ))}

        <Text style={styles.footerNote}>
          Your current Chef account, order state and local drafts are not changed by this screen.
        </Text>
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={closeUnavailable}
        transparent
        visible={modalState.visible}>
        <Pressable
          accessibilityLabel="Close preference details"
          accessibilityRole="button"
          onPress={closeUnavailable}
          style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="none"
            onPress={event => event.stopPropagation()}
            style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Icon name="shield" size={iconSize.lg} color={colors.flameRed} />
            </View>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              {activeItem?.label ?? 'Preference unavailable'}
            </Text>
            <Text style={styles.modalBody}>
              {activeItem?.reason ??
                'This Chef preference cannot be changed until its production contract is available.'}
            </Text>
            <Text style={styles.modalFootnote}>
              No local fallback or placeholder save will be used.
            </Text>
            <Pressable
              accessibilityLabel="Close preference details"
              accessibilityRole="button"
              onPress={closeUnavailable}
              style={({pressed}) => [styles.modalCloseButton, pressed && styles.pressed]}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.white},
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  backText: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  contractBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.md,
    ...elevation.card,
  },
  contractIcon: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningSoft,
  },
  contractCopy: {flex: 1},
  contractTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  contractText: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  sectionWrap: {gap: spacing.xs},
  sectionTitle: {
    marginLeft: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  sectionCard: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  preferenceRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  preferenceRowBorder: {
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  preferenceCopy: {flex: 1, minWidth: 0},
  preferenceLabel: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  preferenceHelper: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  trailingRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  trailingToggleWrap: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  unavailablePill: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  unavailablePillText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  disabledToggle: {
    width: 44,
    height: 26,
    borderRadius: radius.pill,
    justifyContent: 'center',
    backgroundColor: colors.borderStrong,
    paddingHorizontal: spacing.xxs,
    opacity: 0.72,
  },
  disabledToggleThumb: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  footerNote: {
    paddingHorizontal: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    padding: spacing.lg,
    ...elevation.card,
  },
  modalIcon: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  modalTitle: {
    marginTop: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  modalBody: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  modalFootnote: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  modalCloseButton: {
    minHeight: touchTarget.minimum,
    marginTop: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRed,
    paddingHorizontal: spacing.lg,
  },
  modalCloseText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  pressed: {opacity: 0.62},
});
