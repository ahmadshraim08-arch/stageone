// Stub for @clerk/expo NativeClerkModule on web.
// react-native-web does not expose TurboModuleRegistry, so the native spec
// crashes at module-load time. Returning null tells @clerk/expo the native
// plugin is unavailable — native-module.js skips it when Platform.OS !== "ios|android".
module.exports = null;
