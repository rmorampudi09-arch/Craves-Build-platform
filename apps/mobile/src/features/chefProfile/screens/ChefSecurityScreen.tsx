import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import type {ChefProfileStackParamList} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {colors, spacing, textDefaults, typography} from '../../../design/tokens';
import {deletionCopy} from '../../accountDeletion/domain/deletionCopy';
import {useLatestDeletion} from '../../accountDeletion/query/useLatestDeletion';
import {ChefScreen, ChefTopBar, ListGroup, ListRow, StatusChip} from '../../chefShell/components/ui';

/** `+91 ••••• 43210`: the country code and the last five digits. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)}` : '+91';
  return `${country} ••••• ${digits.slice(-5)}`;
}

/** `c•••@gmail.com`: the first letter and the domain. */
function maskEmail(email: string): string {
  const [name, domain = ''] = email.split('@');
  return `${name.charAt(0)}${'•'.repeat(Math.min(Math.max(name.length - 1, 1), 6))}@${domain}`;
}

/** Login & security: what the chef logs in with, and the two account actions. */
export function ChefSecurityScreen() {
  const navigation = useNavigation<NavigationProp<ChefProfileStackParamList>>();
  const identity = useAppSelector(state => state.auth.identity);
  const {showRow} = useLatestDeletion();

  return (
    <ChefScreen
      header={<ChefTopBar onBack={() => navigation.goBack()} showBell={false} title="Login & security" />}
      withTabBar>
      <ListGroup>
        <ListRow
          icon="phone"
          right={<StatusChip label="Verified" tone="ready" />}
          subtitle={`${identity ? maskPhone(identity.phoneNumber) : '—'} · used to log in`}
          title="Mobile number"
        />
        <ListRow
          icon="mail"
          right={
            identity?.email ? (
              <StatusChip label={identity.emailVerified ? 'Verified' : 'Not verified'} tone={identity.emailVerified ? 'ready' : 'draft'} />
            ) : (
              <StatusChip label="Not added" tone="draft" />
            )
          }
          subtitle={identity?.email ? maskEmail(identity.email) : undefined}
          title="Email"
        />
      </ListGroup>
      <ListGroup>
        <ListRow
          icon="phone"
          right={<StatusChip label="Coming soon" tone="soon" />}
          subtitle="If you lost a phone or shared your login"
          title="Log out of other devices"
        />
        {showRow ? (
          <ListRow
            destructive
            icon="trash"
            onPress={() => navigation.navigate('ChefDeleteAccount')}
            subtitle={deletionCopy.row.chefSubtitle}
            title={deletionCopy.row.chefTitle}
          />
        ) : null}
      </ListGroup>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.note}>
        To change your mobile number, contact support. You log in with a one-time code, so there's no password to manage.
      </Text>
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  note: {paddingHorizontal: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
});
