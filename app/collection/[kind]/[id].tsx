import { useLocalSearchParams } from 'expo-router';

import { CollectionDetailScreen } from '@/features/library/CollectionDetailScreen';

/** One artist or one album. Route files read params and render, nothing else. */
export default function CollectionRoute() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const numericId = Number(id);

  if (!Number.isFinite(numericId) || (kind !== 'artist' && kind !== 'album')) return null;

  return <CollectionDetailScreen kind={kind} id={numericId} />;
}
