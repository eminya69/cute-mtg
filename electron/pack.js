const packager = require('electron-packager');

async function bundleElectronApp(options) {
  const appPaths = await packager(options);
  console.log(`Electron app bundles created:\n${appPaths.join('\n')}`);
}

bundleElectronApp({
  dir: '.',
  name: 'cute-mtg-client',
  platform: 'win32',
  arch: 'x64',
  out: 'dist_packager',
  overwrite: true,
  asar: true
});
