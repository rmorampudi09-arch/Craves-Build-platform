import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useQueryClient} from '@tanstack/react-query';
import {spacing} from '../../../design/tokens';
import {OptionChip} from '../../chefMenu/components/DishFormField';
import {ChefSwitch} from '../../chefProfile/components/ChefSwitch';
import {ReadState} from '../../chefProfile/components/ReadState';
import {useChefRead} from '../../chefProfile/state/useChefRead';
import {
  ChefScreen,
  ChefSheet,
  ChefTopBar,
  ConfirmDialog,
  ListGroup,
  ListRow,
  SectionHeader,
  StatusChip,
  useChefToast,
} from '../../chefShell/components/ui';
import {
  chefKitchenSettingsApi,
  type ChefKitchenSettings,
} from '../api/chefKitchenSettingsApi';
import {
  isChannelEnabled,
  notificationPreferencesApi,
  type NotificationChannel,
  type NotificationPreference,
} from '../api/notificationPreferencesApi';

export const PREFERENCE_SAVE_FAILED = "We couldn't save that. Please try again.";
const COOKING_TIMES = [10, 15, 20, 25, 30, 40, 45, 60];

const comingSoonChip = <StatusChip label="Coming soon" tone="info" />;

export function ChefAppPreferencesScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const toast = useChefToast();
  const prefs = useChefRead('chef-notification-preferences', signal => notificationPreferencesApi.list(signal));
  const settings = useChefRead('chef-kitchen-settings', signal => chefKitchenSettingsApi.get(signal));

  const saving = React.useRef(false);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  /** One save at a time; a failed save changes nothing on screen and says so. */
  const save = async (key: string, run: () => Promise<void>) => {
    if (saving.current) {
      return;
    }
    saving.current = true;
    setSavingKey(key);
    try {
      await run();
    } catch {
      toast.show(PREFERENCE_SAVE_FAILED);
    } finally {
      saving.current = false;
      setSavingKey(null);
    }
  };

  const saveChannel = (channel: NotificationChannel, enabled: boolean) =>
    save(channel, async () => {
      const saved = await notificationPreferencesApi.set(channel, enabled);
      queryClient.setQueryData<NotificationPreference[]>(prefs.queryKey, current => [
        ...(current ?? []).filter(preference => preference.channel !== channel),
        saved,
      ]);
    });
  const saveSettings = (next: ChefKitchenSettings) =>
    save('settings', async () => {
      queryClient.setQueryData<ChefKitchenSettings>(settings.queryKey, await chefKitchenSettingsApi.update(next));
    });

  const [confirmAuto, setConfirmAuto] = React.useState(false);
  const [timeSheet, setTimeSheet] = React.useState(false);
  const current = settings.query.data;
  const minutes = current?.defaultPrepMinutes ?? null;
  const times = [...new Set(minutes ? [...COOKING_TIMES, minutes] : COOKING_TIMES)].sort((a, b) => a - b);

  const channelRow = (channel: NotificationChannel, title: string, subtitle?: string) => (
    <ListRow
      key={channel}
      right={
        <ChefSwitch
          busy={savingKey === channel}
          label={title}
          onChange={enabled => {
            saveChannel(channel, enabled).catch(() => undefined);
          }}
          value={isChannelEnabled(prefs.query.data ?? [], channel)}
        />
      }
      subtitle={subtitle}
      title={title}
    />
  );

  return (
    <ChefScreen
      header={<ChefTopBar onBack={() => navigation.goBack()} showBell={false} title="Preferences" />}
      withTabBar>
      <SectionHeader title="Notifications" />
      <ListGroup>
        <ListRow right={comingSoonChip} subtitle="Loud ring until you open the order" title="New order sound" />
      </ListGroup>
      <ReadState
        comingSoon={{title: 'Notification settings are on their way', message: 'You will be able to choose how Craves reaches you here soon.'}}
        query={prefs.query}>
        {() => (
          <ListGroup>
            {channelRow('PUSH', 'Push notifications')}
            <ListRow right={comingSoonChip} subtitle="Payouts and account alerts" title="SMS" />
            {channelRow('EMAIL', 'Email', 'Statements and updates')}
          </ListGroup>
        )}
      </ReadState>

      <SectionHeader title="Orders" />
      <ReadState
        comingSoon={{title: 'Order settings are on their way', message: 'Automatic acceptance and a default cooking time will be here soon.'}}
        query={settings.query}>
        {() => (
          <ListGroup>
            <ListRow
              right={
                <ChefSwitch
                  busy={savingKey === 'settings'}
                  label="Accept orders automatically"
                  onChange={on => {
                    if (on) {
                      setConfirmAuto(true);
                    } else if (current) {
                      saveSettings({...current, autoAcceptOrders: false}).catch(() => undefined);
                    }
                  }}
                  value={current?.autoAcceptOrders ?? false}
                />
              }
              subtitle="Only while your kitchen is open"
              title="Accept orders automatically"
            />
            <ListRow
              onPress={() => setTimeSheet(true)}
              subtitle="Used when a dish has no time set"
              title="Default cooking time"
              value={minutes ? `${minutes} min` : 'Not set'}
            />
          </ListGroup>
        )}
      </ReadState>

      <SectionHeader title="App" />
      <ListGroup>
        <ListRow right={comingSoonChip} title="Language" value="English" />
        <ListRow right={comingSoonChip} title="Theme" value="Same as phone" />
      </ListGroup>

      <ConfirmDialog
        cancelLabel="Not now"
        confirmLabel="Turn on"
        message="Orders are accepted with your cooking time while your kitchen is open."
        onCancel={() => setConfirmAuto(false)}
        onConfirm={() => {
          setConfirmAuto(false);
          if (current) {
            saveSettings({...current, autoAcceptOrders: true}).catch(() => undefined);
          }
        }}
        title="Accept new orders automatically?"
        visible={confirmAuto}
      />
      <ChefSheet onClose={() => setTimeSheet(false)} title="Default cooking time" visible={timeSheet}>
        <View style={styles.options}>
          {times.map(value => (
            <OptionChip
              key={value}
              label={`${value} min`}
              onPress={() => {
                setTimeSheet(false);
                if (current) {
                  saveSettings({...current, defaultPrepMinutes: value}).catch(() => undefined);
                }
              }}
              selected={value === minutes}
            />
          ))}
        </View>
      </ChefSheet>
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingBottom: spacing.sm},
});
