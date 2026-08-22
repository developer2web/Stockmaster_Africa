import { defineConfig } from 'vite';
export default defineConfig({root:'apps/account-web',cacheDir:'../../node_modules/.vite-account-web',envDir:'../..',envPrefix:['VITE_','EXPO_PUBLIC_'],build:{outDir:'../../dist/account-web',emptyOutDir:true}});
