import type { ReactNode } from 'react';
import { MockArt, type MockArtProps } from '../art/MockArt';

export function ArtThumb({
  art,
  ratio = '1 / 1',
  children,
  className = '',
  'data-testid': testId,
  ...rest
}: Omit<MockArtProps, 'width' | 'height' | 'standalone'> & { ratio?: string; children?: ReactNode; className?: string; 'data-testid'?: string }) {
  return (
    <div className={`art ${className}`.trim()} style={{ aspectRatio: ratio }} data-testid={testId}>
      <MockArt art={art} {...rest} />
      {children}
    </div>
  );
}
