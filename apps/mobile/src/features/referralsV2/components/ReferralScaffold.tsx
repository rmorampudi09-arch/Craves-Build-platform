import React, { type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import {
  referralColors,
  referralFontAssets,
  referralFonts,
  referralLayout,
} from './referralVisuals';

export function ReferralScaffold({
  role,
  title,
  subtitle,
  onBack,
  children,
  refreshControl,
}: PropsWithChildren<{
  role: 'Customer' | 'Chef';
  title: string;
  subtitle: string;
  onBack: () => void;
  refreshControl?: ScrollViewProps['refreshControl'];
}>) {
  const [fontsLoaded, fontError] = useFonts(referralFontAssets);
  return (
    <SafeAreaView
      style={styles.root}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.back}
        >
          <ChevronLeft
            size={28}
            strokeWidth={2.3}
            color={referralColors.muted}
          />
        </Pressable>
        <Text style={styles.role}>{role}</Text>
      </View>
      {fontsLoaded || fontError ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          contentContainerStyle={styles.content}
        >
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          {children}
        </ScrollView>
      ) : (
        <ActivityIndicator
          style={styles.loader}
          color={referralColors.red}
          accessibilityLabel="Loading referral screen"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: referralColors.white },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  back: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  role: {
    fontFamily: referralFonts.regular,
    fontSize: 13,
    color: referralColors.muted,
    marginRight: 8,
  },
  content: {
    paddingHorizontal: referralLayout.inset,
    paddingBottom: 24,
    gap: referralLayout.sectionGap,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  heading: { marginTop: 8, marginBottom: 8, paddingHorizontal: 3, gap: 6 },
  title: {
    fontFamily: referralFonts.bold,
    fontSize: 30,
    color: referralColors.ink,
    letterSpacing: 0,
  },
  subtitle: {
    fontFamily: referralFonts.regular,
    fontSize: 16,
    lineHeight: 23,
    color: referralColors.muted,
  },
  loader: { flex: 1 },
});
