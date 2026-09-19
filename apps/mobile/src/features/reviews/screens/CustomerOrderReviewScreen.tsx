import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import type {CustomerOrdersStackParamList} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {
  customerReviewsApi,
  type CustomerReview,
  type ReviewTagDefinition,
} from '../api/customerReviewsApi';

type ReviewRoute = RouteProp<
  CustomerOrdersStackParamList,
  'CustomerOrderReview'
>;
type ReviewNavigation = NavigationProp<
  CustomerOrdersStackParamList,
  'CustomerOrderReview'
>;

const RATINGS = [1, 2, 3, 4, 5] as const;

function statusCopy(review: CustomerReview): string {
  switch (review.status) {
    case 'PUBLISHED':
      return 'Published';
    case 'PENDING_MODERATION':
      return 'Submitted for review';
    case 'HIDDEN':
      return 'Not currently public';
    case 'REJECTED':
      return 'Not published';
  }
}

export function CustomerOrderReviewScreen() {
  const navigation = useNavigation<ReviewNavigation>();
  const route = useRoute<ReviewRoute>();
  const orderId = route.params.orderId;

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [existing, setExisting] = React.useState<CustomerReview | null>(null);
  const [tags, setTags] = React.useState<ReviewTagDefinition[]>([]);
  const [rating, setRating] = React.useState<number | null>(null);
  const [reviewText, setReviewText] = React.useState('');
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const [reviewResult, tagsResult] = await Promise.allSettled([
      customerReviewsApi.getForOrder(orderId),
      customerReviewsApi.listTags(),
    ]);

    let ownedReview: CustomerReview | null = null;
    if (reviewResult.status === 'fulfilled') {
      ownedReview = reviewResult.value;
      setExisting(ownedReview);
      setRating(ownedReview.overallRating);
      setReviewText(ownedReview.reviewText ?? '');
      setSelectedTags(ownedReview.tagCodes);
    } else {
      const error = toAppApiError(reviewResult.reason);
      if (error.status !== 404 && error.code !== 'ORDER_REVIEW_NOT_FOUND') {
        setLoadError(error.message);
      } else {
        setExisting(null);
        setRating(null);
        setReviewText('');
        setSelectedTags([]);
      }
    }

    if (tagsResult.status === 'fulfilled') {
      setTags(tagsResult.value);
    } else if (!ownedReview) {
      setTags([]);
    }

    setLoading(false);
  }, [orderId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const toggleTag = (code: string) => {
    setSelectedTags(current => {
      if (current.includes(code)) {
        return current.filter(item => item !== code);
      }
      if (current.length >= 10) return current;
      return [...current, code];
    });
  };

  const save = async () => {
    if (!rating) {
      Alert.alert('Rating required', 'Choose a rating from 1 to 5.');
      return;
    }
    if (reviewText.trim().length > 2000) {
      Alert.alert('Review too long', 'Keep your review within 2,000 characters.');
      return;
    }
    if (existing?.mediaAssetIds.length) {
      Alert.alert(
        'Edit unavailable',
        'This review contains media that this app version cannot safely edit.',
      );
      return;
    }

    setSaving(true);
    try {
      const shared = {
        overallRating: rating,
        foodTasteRating: existing?.foodTasteRating ?? null,
        portionValueRating: existing?.portionValueRating ?? null,
        packagingRating: existing?.packagingRating ?? null,
        accuracyRating: existing?.accuracyRating ?? null,
        chefPreparationRating: existing?.chefPreparationRating ?? null,
        deliveryRating: existing?.deliveryRating ?? null,
        reviewText,
        tagCodes: selectedTags,
      };

      const saved = existing
        ? await customerReviewsApi.update(orderId, {
            ...shared,
            expectedVersion: existing.version,
          })
        : await customerReviewsApi.create(orderId, shared);

      setExisting(saved);
      setRating(saved.overallRating);
      setReviewText(saved.reviewText ?? '');
      setSelectedTags(saved.tagCodes);
      Alert.alert(
        existing ? 'Review updated' : 'Review submitted',
        'Your review is pending moderation before it can appear publicly.',
      );
    } catch (error) {
      const apiError = toAppApiError(error);
      if (
        apiError.status === 409 ||
        apiError.code === 'ORDER_REVIEW_VERSION_CONFLICT'
      ) {
        Alert.alert(
          'Review changed',
          'Refresh the review before saving your changes.',
          [{text: 'Refresh', onPress: () => void load()}],
        );
      } else {
        Alert.alert('Could not save review', apiError.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenShell
      edges={['top']}
      keyboardAvoiding
      testID="customer-order-review">
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to order details"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={({pressed}) => [
              styles.headerAction,
              pressed && styles.pressed,
            ]}>
            <Icon name="arrow-left" size={24} surface={false} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            Rate your order
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View
            accessibilityLabel="Loading review"
            accessibilityRole="progressbar"
            style={styles.loading}>
            <ActivityIndicator color={colors.flameRed} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {loadError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{loadError}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void load()}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : null}

            {existing ? (
              <View style={styles.statusCard}>
                <Text style={styles.statusLabel}>Review status</Text>
                <Text style={styles.statusValue}>{statusCopy(existing)}</Text>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Overall rating</Text>
              <Text style={styles.sectionCaption}>
                Choose one rating from 1 to 5.
              </Text>
              <View style={styles.ratingRow}>
                {RATINGS.map(value => {
                  const selected = rating === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityLabel={`Rate ${value} out of 5`}
                      accessibilityRole="button"
                      accessibilityState={{selected}}
                      onPress={() => setRating(value)}
                      style={({pressed}) => [
                        styles.ratingButton,
                        selected && styles.ratingButtonSelected,
                        pressed && styles.pressed,
                      ]}>
                      <Text
                        style={[
                          styles.ratingText,
                          selected && styles.ratingTextSelected,
                        ]}>
                        {value}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {tags.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>What stood out?</Text>
                <Text style={styles.sectionCaption}>
                  Optional. These choices come from the current Craves review
                  taxonomy.
                </Text>
                <View style={styles.tagsWrap}>
                  {tags.map(tag => {
                    const selected = selectedTags.includes(tag.code);
                    return (
                      <Pressable
                        key={tag.code}
                        accessibilityRole="button"
                        accessibilityState={{selected}}
                        onPress={() => toggleTag(tag.code)}
                        style={({pressed}) => [
                          styles.tag,
                          selected && styles.tagSelected,
                          pressed && styles.pressed,
                        ]}>
                        <Text
                          style={[
                            styles.tagText,
                            selected && styles.tagTextSelected,
                          ]}>
                          {tag.displayLabel}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Write a review</Text>
              <TextInput
                accessibilityLabel="Review text"
                maxLength={2000}
                multiline
                onChangeText={setReviewText}
                placeholder="Share your experience (optional)"
                placeholderTextColor={colors.textSecondary}
                style={styles.textInput}
                textAlignVertical="top"
                value={reviewText}
              />
              <Text style={styles.characterCount}>
                {reviewText.length}/2000
              </Text>
            </View>

            <View style={styles.privacyCard}>
              <Text style={styles.privacyText}>
                Your review is moderated before public display. Customer
                identity and delivery details are not part of the public review.
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{disabled: saving || Boolean(loadError)}}
              disabled={saving || Boolean(loadError)}
              onPress={() => void save()}
              style={({pressed}) => [
                styles.submitButton,
                (saving || Boolean(loadError)) && styles.disabled,
                pressed && styles.pressed,
              ]}>
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.submitText}>
                  {existing ? 'Update review' : 'Submit review'}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surfaceBase},
  header: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  headerAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  headerTitle: {
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  headerSpacer: {width: 44},
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  content: {padding: spacing.md, paddingBottom: spacing.xxl},
  card: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  statusCard: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  statusLabel: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  statusValue: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  sectionCaption: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 19,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  ratingButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  ratingButtonSelected: {
    borderColor: colors.flameRed,
    backgroundColor: colors.errorSoft,
  },
  ratingText: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  ratingTextSelected: {color: colors.flameRed},
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  tag: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  tagSelected: {
    borderColor: colors.flameRed,
    backgroundColor: colors.errorSoft,
  },
  tagText: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  tagTextSelected: {color: colors.flameRed},
  textInput: {
    minHeight: 140,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    color: colors.textPrimary,
    backgroundColor: colors.white,
    fontSize: typography.body,
  },
  characterCount: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    textAlign: 'right',
  },
  privacyCard: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  privacyText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 19,
  },
  errorCard: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.errorSoft,
  },
  errorText: {color: colors.error, fontSize: typography.small},
  retryText: {
    marginTop: spacing.xs,
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  submitButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.flameRed,
  },
  submitText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  disabled: {opacity: 0.5},
  pressed: {opacity: 0.78},
});
