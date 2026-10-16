# DEAD SIGNAL Android 1.0.0 (build 1)

This native project bundles the prepared game assets. It does not load a hosted website. Package identity is `kr.bottlecorp.deadsignal`, minimum Android API 24, target/compile API 36. Both portrait and landscape layouts remain available; there is no fixed activity orientation.

## Build

Use an existing JDK 21 and Android SDK containing API 36. Android Studio's bundled JBR can be selected for this command without changing the system Java installation:

```sh
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
ANDROID_HOME="/path/to/Android/sdk" \
./gradlew :app:assembleDebug :app:bundleRelease :app:lintRelease :app:testDebugUnitTest \
  --console=plain --no-daemon --max-workers=2
```

The root project must prepare its offline `dist` and run `npx cap sync android` before building. Do not sync web/configuration assets during a native build.

Outputs are `app/build/outputs/apk/debug/app-debug.apk` for local testing and `app/build/outputs/bundle/release/app-release.aab` as the unsigned release bundle. The debug APK uses a development certificate and must never be submitted as the production release. Release signing is deliberately unset; an authorized owner must use the app's own upload key and Play App Signing configuration. No production key was created or borrowed from another application.

## Native behavior and verification

Release WebView inspection and native debugging are disabled. Cleartext traffic, OS cloud backup and device-transfer backup are disabled; game progress remains on the installation and can be lost on uninstall or app-data removal. The app declares no Internet or sensitive runtime permission. AndroidX adds only the app-scoped signature permission for unexported dynamic receivers.

The current app has no advertising or billing SDK. Store billing, purchases, Play Console registration, Data safety answers, age/content rating, signing and publication are separate release steps and are not implied by a successful build.

Inspect the exact AAB with bundletool and confirm its actual manifest, ZIP integrity, embedded web/bridge asset hashes and native shared-library inventory. A bundle without `.so` files has no app-bundled ELF alignment requirement; this alone is not a 16 KB device runtime test. The prepared native build uses 16 KB ZIP alignment in its bundle configuration.

The template JVM unit test is only a Gradle smoke check. Actual game behavior, native lifecycle, touch controls, offline loading, orientation and save restoration require app UI testing; emulator checks do not establish physical-device performance.

## Official requirements checked

- Google Play target API requirement: https://developer.android.com/google/play/requirements/target-sdk
- 16 KB page compatibility: https://developer.android.com/guide/practices/page-sizes
- Capacitor 8 native requirements: https://capacitorjs.com/docs/updating/8-0
