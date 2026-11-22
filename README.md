# PULSE

## Round map setup

The iPhone round uses Google Maps SDK for iOS. Set `GOOGLE_MAPS_IOS_API_KEY` in the Expo build environment or in `app/.env.local` for local development. Enable Maps SDK for iOS in the Google Cloud project and restrict the key to the bundle ID `com.babynhi.pulse`. Rebuild the iPhone app after setting or changing this key. [Google’s iOS setup guide](https://developers.google.com/maps/documentation/ios-sdk/get-api-key)

The web preview uses a separate `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY` for the Maps JavaScript API. Restrict it to the web origins that serve PULSE, including localhost for local testing. Restart Expo or rebuild the web export after setting it. [Google’s web setup guide](https://developers.google.com/maps/documentation/javascript/get-api-key)
