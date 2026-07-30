import { useColorScheme } from 'nativewind';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Phase 0a scaffold check. This screen exists to prove the NativeWind 4.2.6
 * pipeline compiles and renders on Expo SDK 57 / RN 0.86, and that every
 * semantic token resolves in both themes. Phase 0b deletes it and replaces it
 * with the real tab routes.
 */
export default function ScaffoldCheck() {
  const { colorScheme, toggleColorScheme } = useColorScheme();

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <ScrollView contentContainerClassName="p-6 gap-6">
        <View className="gap-2">
          <Text className="text-3xl text-primary">Mufify</Text>
          <Text className="text-base text-muted">Scaffold check — theme: {colorScheme}</Text>
        </View>

        {/* Elevation comes from surface value, never from a shadow. */}
        <View className="gap-3 rounded-md border border-subtle bg-surface-elevated p-4">
          <Text className="text-base text-primary">Elevated panel</Text>
          <Text className="text-sm text-muted">
            bg-surface-elevated over bg-surface, separated by border-subtle.
          </Text>
        </View>

        {/* Indigo marks state. One accent element per screen. */}
        <View className="gap-3">
          <View className="rounded-sm bg-accent p-4">
            <Text className="text-base text-on-accent">bg-accent with text-on-accent</Text>
          </View>
          <Text className="text-sm text-accent">text-accent on surface</Text>
        </View>

        {/* Radius scale — deliberately short, nothing above 8px. */}
        <View className="flex-row gap-3">
          <View className="h-12 w-12 rounded-none bg-accent" />
          <View className="h-12 w-12 rounded-xs bg-accent" />
          <View className="h-12 w-12 rounded-sm bg-accent" />
          <View className="h-12 w-12 rounded-md bg-accent" />
          <View className="h-12 w-12 rounded-full bg-accent" />
        </View>

        {/* Opacity modifier — proves the rgb(var(--x) / <alpha-value>) form. */}
        <View className="rounded-sm bg-accent/20 p-4">
          <Text className="text-sm text-primary">bg-accent/20</Text>
        </View>

        <Pressable
          onPress={toggleColorScheme}
          className="min-h-11 items-center justify-center rounded-sm border border-accent p-4"
        >
          <Text className="text-base text-accent">Toggle theme</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
