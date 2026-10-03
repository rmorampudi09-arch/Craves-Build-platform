import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {useAppSelector} from '../../../app/store/hooks';
import {httpClient} from '../../../core/http/httpClient';
import {colors, spacing, radius, typography, touchTarget} from '../../../design/tokens';
import {createChefBusinessVerificationQueryKey} from '../state/chefBusinessInformationQuery';
import {chefBusinessDocumentTypeLabel} from '../domain/chefBusinessInformationPresentation';
import {chefReadinessSummary, parseChefApplicationReadiness} from '../domain/chefReadinessContract';

export function ChefReadinessPanel() {
  const identity = useAppSelector(state => state.auth.identity);
  const query = useQuery({
    queryKey: identity?.id ? [...createChefBusinessVerificationQueryKey(identity.id), 'readiness'] : ['chef-readiness', 'signed-out'],
    enabled: Boolean(identity?.id),
    staleTime: 0,
    retry: false,
    queryFn: async ({signal}) => {
      const response = await httpClient.get<unknown>('/api/v1/chef/application/readiness', {signal, dedupeKey: `chef-application:readiness:${identity?.id}`});
      const parsed = parseChefApplicationReadiness(response);
      if (!parsed) throw new Error('Application readiness is unavailable.');
      return parsed;
    },
  });
  if (!identity?.id) return null;
  const loading = query.isPending || query.isFetching;
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>Application readiness</Text>
    {loading ? <Text style={styles.text}>Checking current approval requirements…</Text>
      : query.isError || !query.data ? <Text accessibilityRole="alert" style={styles.text}>We couldn’t check application readiness. Please try again.</Text>
        : <>
          <Text style={styles.text}>{chefReadinessSummary(query.data)}</Text>
          {query.data.documents.map(document => <View key={document.documentType} style={styles.document}>
            <Text style={styles.text}>{chefBusinessDocumentTypeLabel(document.documentType)}: {document.status.replaceAll('_', ' ')}</Text>
            {document.rejectionReason ? <Text style={styles.text}>{document.rejectionReason}</Text> : null}
          </View>)}
          <Text style={styles.text}>These checks cover your Chef application. They do not certify food-business compliance or enable payouts.</Text>
        </>}
    <Pressable accessibilityRole="button" accessibilityState={{disabled: loading}} disabled={loading} onPress={() => { void query.refetch(); }} style={styles.button}>
      <Text style={styles.text}>Refresh readiness</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  card: {padding: spacing.md, gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border},
  title: {fontSize: typography.heading, fontWeight: '700', color: colors.textPrimary},
  text: {fontSize: typography.small, color: colors.textPrimary},
  document: {paddingVertical: spacing.xs},
  button: {minHeight: touchTarget.minimum, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md},
});
