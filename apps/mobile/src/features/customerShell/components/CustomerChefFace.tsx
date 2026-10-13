import React, {useState} from 'react';
import {Image, StyleSheet} from 'react-native';

interface Props {
  url: string | null | undefined;
  fallback: React.ReactNode;
}

// Fills its parent, so the parent circle needs overflow: 'hidden'.
export function CustomerChefFace({url, fallback}: Props) {
  // Remember which url failed, so a new url gets its own try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || !/^https:\/\//i.test(url) || url === failedUrl) {
    return <>{fallback}</>;
  }

  return (
    <Image
      accessibilityIgnoresInvertColors
      source={{uri: url}}
      resizeMode="cover"
      style={StyleSheet.absoluteFill}
      onError={() => setFailedUrl(url)}
    />
  );
}
