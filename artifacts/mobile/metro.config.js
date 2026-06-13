const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const originalResolver = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web") {
    // Stub @clerk/expo/token-cache — expo-secure-store is native only;
    // Clerk handles sessions via cookies on web.
    if (moduleName === "@clerk/expo/token-cache") {
      return {
        filePath: path.resolve(__dirname, "shims/clerk-token-cache-web.js"),
        type: "sourceFile",
      };
    }

    // Stub NativeClerkModule — react-native-web doesn't expose TurboModuleRegistry,
    // so @clerk/expo's native spec crashes at module-load time on web.
    // Returning null tells @clerk/expo the native plugin is not installed.
    if (moduleName.endsWith("NativeClerkModule") || moduleName.endsWith("NativeClerkModule.js")) {
      return {
        filePath: path.resolve(__dirname, "shims/NativeClerkModule.js"),
        type: "sourceFile",
      };
    }
  }

  if (originalResolver) {
    return originalResolver(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
