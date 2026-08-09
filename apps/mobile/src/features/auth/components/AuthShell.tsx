import React, {PropsWithChildren} from 'react';
import {StyleSheet} from 'react-native';
import {responsiveLayout} from '../../../design/responsive';
import {colors} from '../../../design/tokens';
import {ScreenShell} from '../../../shared/components';

interface Props extends PropsWithChildren {
  scroll?: boolean;
}

export function AuthShell({children, scroll = true}: Props) {
  return (
    <ScreenShell
      backgroundColor={colors.surfaceWarm}
      contentContainerStyle={styles.content}
      scroll={scroll}>
      {children}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: responsiveLayout.authContentMaxWidth,
    alignSelf: 'center',
  },
});
