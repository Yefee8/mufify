import { useLocalSearchParams } from 'expo-router';

import { PlaylistDetailScreen } from '@/features/playlists/PlaylistDetailScreen';

export default function Playlist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaylistDetailScreen playlistId={Number(id)} />;
}
