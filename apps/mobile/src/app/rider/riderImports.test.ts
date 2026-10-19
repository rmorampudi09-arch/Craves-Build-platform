// The app's tsconfig has no Node types, so declare the little this test uses.
declare const __dirname: string;
const fs: {
  readdirSync(dir: string, options: {withFileTypes: true}): {name: string; isDirectory(): boolean}[];
  readFileSync(file: string, encoding: 'utf8'): string;
} = require('fs');
const path: {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
  relative(from: string, to: string): string;
  dirname(file: string): string;
  sep: string;
} = require('path');

// src/app may use any feature, but the rider shell reuses only these sign-in pieces from features/auth.
const ALLOWED_AUTH = [
  'features/auth/state/authService',
  'features/auth/state/authSlice',
  'features/auth/state/logoutCoordinator',
  'features/auth/hooks/useBootstrap',
  'features/auth/hooks/useSessionLifecycle',
  'features/auth/screens/SplashScreen',
];

function files(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('rider shell imports', () => {
  it('uses only the rider feature and the allowed auth modules', () => {
    const src = path.resolve(__dirname, '../..');
    const offending: string[] = [];
    for (const file of files(__dirname)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from '(\.[^']+)'/g)) {
        const target = path.relative(src, path.resolve(path.dirname(file), match[1])).split(path.sep).join('/');
        if (!target.startsWith('features/')) {
          continue;
        }
        if (target.startsWith('features/rider/') || ALLOWED_AUTH.includes(target)) {
          continue;
        }
        offending.push(`${path.relative(src, file)} -> ${target}`);
      }
    }
    expect(offending).toEqual([]);
  });
});
