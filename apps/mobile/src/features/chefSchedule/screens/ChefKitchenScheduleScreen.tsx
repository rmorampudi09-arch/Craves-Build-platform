import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {useChefKitchenScheduleModel} from '../state/useChefKitchenScheduleModel';

const DAY_NAMES = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

function formatTime(value: string): string {
  return value.slice(0, 5);
}

export function ChefKitchenScheduleScreen() {
  const navigation = useNavigation();
  const model = useChefKitchenScheduleModel();

  const run = React.useCallback(
    (action: () => Promise<void>, fallback: string) => {
      action().catch(() => {
        Alert.alert('Could not update availability', fallback);
      });
    },
    [],
  );

  if (!model.available) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <Header onBack={() => navigation.goBack()} />
        <View style={styles.centerState}>
          <Icon name="clock" size={36} color={colors.textSecondary} />
          <Text style={styles.stateTitle}>Kitchen schedule is not live yet</Text>
          <Text style={styles.stateText}>
            The Catalog schedule API is implemented, but its protected APIM route
            is not published yet. Craves will not send schedule changes until that
            gateway route is available.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const schedule = model.schedule;
  const availability = model.availability;
  const paused =
    Boolean(schedule?.pausedUntil) &&
    Date.parse(schedule?.pausedUntil ?? '') > Date.now();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <Header onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.flameRed]}
            onRefresh={() => {
              model.refresh().catch(() => undefined);
            }}
            refreshing={model.isRefreshing}
            tintColor={colors.flameRed}
          />
        }>
        {model.status === 'pending' && !schedule ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.flameRed} />
            <Text style={styles.stateText}>Loading kitchen schedule…</Text>
          </View>
        ) : model.status === 'error' && !schedule ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>Schedule unavailable</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => model.refresh().catch(() => undefined)}
              style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : schedule ? (
          <>
            <View style={styles.statusCard}>
              <View style={styles.statusRow}>
                <View style={styles.statusCopy}>
                  <Text style={styles.cardTitle}>Accepting orders</Text>
                  <Text style={styles.cardText}>
                    Master control for new customer orders.
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Accepting orders"
                  disabled={model.isSaving}
                  onValueChange={value =>
                    run(
                      () => model.setAcceptingOrders(value),
                      'Your accepting-orders setting was not changed.',
                    )
                  }
                  value={schedule.acceptingOrders}
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.availabilityRow}>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        availability?.availableNow === true
                          ? colors.success
                          : colors.warning,
                    },
                  ]}
                />
                <View style={styles.statusCopy}>
                  <Text style={styles.cardTitle}>
                    {availability
                      ? availability.availableNow
                        ? 'Available now'
                        : 'Not available now'
                      : paused
                        ? 'Paused'
                        : schedule.acceptingOrders
                          ? 'Accepting orders'
                          : 'Not accepting orders'}
                  </Text>
                  <Text style={styles.cardText}>
                    {availability
                      ? [
                          availability.kitchenActive ? 'Kitchen active' : 'Kitchen inactive',
                          availability.openBySchedule
                            ? 'inside service hours'
                            : 'outside service hours',
                          availability.paused ? 'paused' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : model.availabilityAvailable
                        ? 'Current availability is refreshing.'
                        : 'Live availability route is not published through APIM yet.'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Pause controls</Text>
              <Text style={styles.cardText}>
                Pause temporarily without changing your saved weekly hours.
              </Text>
              {paused ? (
                <Text style={styles.pauseText}>
                  Paused until {new Date(schedule.pausedUntil ?? '').toLocaleString()}
                  {schedule.pauseReason ? ` · ${schedule.pauseReason}` : ''}
                </Text>
              ) : null}
              <View style={styles.buttonRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={model.isSaving}
                  onPress={() =>
                    run(
                      model.pauseForOneHour,
                      'Your kitchen was not paused.',
                    )
                  }
                  style={({pressed}) => [
                    styles.secondaryButton,
                    (pressed || model.isSaving) && styles.pressed,
                  ]}>
                  <Text style={styles.secondaryButtonText}>Pause 1 hour</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={model.isSaving || !paused}
                  onPress={() =>
                    run(model.resumeNow, 'Your pause was not cleared.')
                  }
                  style={({pressed}) => [
                    styles.primaryButton,
                    (!paused || pressed || model.isSaving) && styles.pressed,
                  ]}>
                  <Text style={styles.primaryButtonText}>Resume now</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Weekly service hours</Text>
              <Text style={styles.cardText}>
                Timezone: {schedule.timezoneId}. Existing multi-window hours are
                shown exactly as saved.
              </Text>
              {schedule.weeklyWindows.length === 0 ? (
                <Text style={styles.emptyHours}>No weekly schedule configured.</Text>
              ) : (
                DAY_NAMES.slice(1).map((dayName, index) => {
                  const dayOfWeek = index + 1;
                  const windows = schedule.weeklyWindows.filter(
                    window => window.dayOfWeek === dayOfWeek,
                  );
                  return (
                    <View key={dayName} style={styles.dayRow}>
                      <Text style={styles.dayName}>{dayName}</Text>
                      <Text style={styles.dayHours}>
                        {windows.length === 0
                          ? 'Closed'
                          : windows
                              .map(
                                window =>
                                  `${formatTime(window.opensAt)}–${formatTime(
                                    window.closesAt,
                                  )}`,
                              )
                              .join(', ')}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>Protected schedule contract</Text>
              <Text style={styles.noteText}>
                Weekly-hour replacement and date overrides are implemented in the
                mobile API, but this screen does not rewrite those windows until a
                dedicated editor is added. Availability controls preserve the full
                existing weekly schedule.
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({onBack}: {onBack: () => void}) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        onPress={onBack}
        style={({pressed}) => [styles.backButton, pressed && styles.pressed]}>
        <Icon name="arrow-left" size={22} color={colors.espressoBrown} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.headerTitle}>
        Availability & hours
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.surfaceBase},
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
  },
  backButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  headerSpacer: {width: touchTarget.minimum},
  centerState: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  stateTitle: {
    marginTop: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  stateText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
    textAlign: 'center',
  },
  statusCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  cardText: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  statusRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  statusCopy: {flex: 1, minWidth: 0},
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {width: 10, height: 10, borderRadius: radius.pill},
  pauseText: {
    marginTop: spacing.sm,
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryButton: {
    minHeight: touchTarget.minimum,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.flameRed,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  secondaryButton: {
    minHeight: touchTarget.minimum,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.flameRed,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  pressed: {opacity: 0.5},
  emptyHours: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  dayRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dayName: {
    width: 92,
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  dayHours: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'right',
  },
  noteCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  noteTitle: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  noteText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 18,
  },
});
