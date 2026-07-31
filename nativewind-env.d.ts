/// <reference types="nativewind/types" />

// The root layout imports global.css for its side effect (Metro processes it
// via withNativeWind). TypeScript needs to be told the module exists.
declare module '*.css';
