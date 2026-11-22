const { withPlugins } = require('expo/config-plugins');

// Resolve the iOS key during native configuration so it stays out of the public Expo manifest.
module.exports = function withGoogleMaps(config) {
  const iosKey = process.env.GOOGLE_MAPS_IOS_API_KEY?.trim();
  if (process.env.EAS_BUILD_PLATFORM === 'ios' && process.env.EAS_BUILD_PROFILE === 'production' && !iosKey) {
    throw new Error('Set GOOGLE_MAPS_IOS_API_KEY before building the production iPhone app.');
  }
  return withPlugins(config, [
    ['react-native-maps', {
      iosGoogleMapsApiKey: iosKey,
      androidGoogleMapsApiKey: config.android?.config?.googleMaps?.apiKey,
    }],
  ]);
};
