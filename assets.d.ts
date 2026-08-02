/**
 * Image imports.
 *
 * Neither `expo/types` nor React Native 0.86 declares these — `expo/types`
 * covers CSS and nothing else, and the image declarations that used to come
 * from `@types/react-native` went away with that package. So importing a PNG
 * is a type error until something says what one is.
 *
 * On native, Metro replaces the import with an asset-registry id, which is a
 * number. That is what `expo-asset`'s `Asset.fromModule` takes.
 */
declare module '*.png' {
  const asset: number;
  export default asset;
}

declare module '*.jpg' {
  const asset: number;
  export default asset;
}
