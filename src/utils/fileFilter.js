export const DEFAULT_IGNORE_PATTERNS = [
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/poetry.lock',
  '**/Pipfile.lock',
  '**/Cargo.lock',
  '**/go.sum',
  '**/composer.lock',
  '**/Gemfile.lock',
  '**/gradle/wrapper/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/*.snap',
  '**/node_modules/**',
  '**/vendor/**',
  '**/dist/**',
  '**/build/**',
  '**/target/**',
  '**/out/**',
  '**/generated/**',
  '**/*.generated.*',
  '**/*.pb.go',
  '**/*.{png,jpg,jpeg,gif,ico,svg,webp,bmp,pdf,zip,gz,tar,jar,war,class,dll,exe,so,dylib,woff,woff2,ttf,eot,mp3,mp4}'
];

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const slash = glob[i + 2] === '/';
        re += slash ? '(?:.*/)?' : '.*';
        i += slash ? 2 : 1;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map(s => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

export function createPathFilter({ ignorePaths = [], includePaths = [] } = {}) {
  const ignore = [...DEFAULT_IGNORE_PATTERNS, ...ignorePaths].map(globToRegExp);
  const include = includePaths.map(globToRegExp);
  return path => {
    if (!path) return false;
    if (include.length && !include.some(re => re.test(path))) return false;
    return !ignore.some(re => re.test(path));
  };
}
