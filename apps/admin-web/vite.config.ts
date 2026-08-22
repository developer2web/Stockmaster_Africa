import { defineConfig } from 'vite';
export default defineConfig({root:'apps/admin-web',cacheDir:'../../node_modules/.vite-admin-web',envDir:'../..',envPrefix:['VITE_','EXPO_PUBLIC_'],build:{outDir:'../../dist/admin-web',emptyOutDir:true}});
