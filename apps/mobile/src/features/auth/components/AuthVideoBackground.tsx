import React, { useEffect, useState } from 'react';
import { AppState, Image, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useReducedMotionPreference } from '../../../design/reducedMotion';

const video = require('../../../assets/auth/craves-login-background.mp4');
const poster = require('../../../assets/auth/craves-login-poster.jpg');

class PlaybackBoundary extends React.Component<
  React.PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LocalVideoPlayback() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const player = useVideoPlayer(video, instance => {
    instance.loop = true;
    instance.muted = true;
    instance.volume = 0;
    instance.audioMixingMode = 'mixWithOthers';
  });

  useEffect(() => {
    if (failed) {
      return;
    }
    const updatePlayback = (state: string) => {
      try {
        if (state === 'active') {
          player.play();
        } else {
          player.pause();
        }
      } catch {
        setFailed(true);
      }
    };
    const status = player.addListener('statusChange', event => {
      if (event.status === 'error') {
        setFailed(true);
        try {
          player.pause();
        } catch {
          // The bundled poster remains visible if the native decoder fails.
        }
      }
    });
    updatePlayback(AppState.currentState);
    const appState = AppState.addEventListener('change', updatePlayback);
    return () => {
      appState.remove();
      status.remove();
    };
  }, [player, failed]);

  if (failed) {
    return null;
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        surfaceType="textureView"
        nativeControls={false}
        allowsPictureInPicture={false}
        onFirstFrameRender={() => setReady(true)}
      />
      {!ready ? (
        <Image
          source={poster}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

/** One local player behind the auth stack; never one decoder per stacked form. */
export function AuthVideoBackground({
  enabled,
  heroFraction = 1,
}: {
  enabled: boolean;
  heroFraction?: number;
}) {
  const reduceMotion = useReducedMotionPreference();
  return (
    <View
      testID="auth-video-background"
      style={[styles.viewport, { height: `${heroFraction * 100}%` }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={poster}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />
      {enabled && !reduceMotion ? (
        <PlaybackBoundary>
          <LocalVideoPlayback />
        </PlaybackBoundary>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { position: 'absolute', top: 0, left: 0, right: 0 },
});
