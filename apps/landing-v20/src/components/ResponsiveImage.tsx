import { useState } from 'react';
import type { ImgHTMLAttributes } from 'react';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'srcSet'> & {
  src: string;
  sizes: string;
};

// Production is served by Next.js. Keep the content fingerprint in the source
// URL so its image cache also changes whenever the original artwork changes.
// Vite development and optimizer failures fall back to the original asset.
export default function ResponsiveImage({ src, sizes, loading = 'lazy', decoding = 'async', ...props }: Props) {
  const [failed, setFailed] = useState(false);
  const optimize = !import.meta.env.DEV && !failed;
  const imageUrl = (width: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
  return (
    <img
      {...props}
      src={optimize ? imageUrl(640) : src}
      srcSet={optimize ? [96, 256, 384, 640, 828, 1080, 1200].map(width => `${imageUrl(width)} ${width}w`).join(', ') : undefined}
      sizes={sizes}
      loading={loading}
      decoding={decoding}
      onError={() => { if (!failed) setFailed(true); }}
    />
  );
}
