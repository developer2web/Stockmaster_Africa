const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const zustandMiddleware = path.join(__dirname, 'node_modules', 'zustand', 'middleware.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'zustand/middleware') {
    return context.resolveRequest(context, zustandMiddleware, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
