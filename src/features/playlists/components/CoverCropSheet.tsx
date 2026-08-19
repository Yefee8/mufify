import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { baseScale, cropRectFor, type CropRect } from '@/services/playlists/cropGeometry';
import type { CoverSource } from '@/services/playlists/cover';
import { SPACING } from '@/theme/tokens';
import { useThemeColors } from '@/theme/useTheme';

import {
  beginPan,
  beginPinch,
  cropScale,
  cropTx,
  cropTy,
  dragBy,
  readCropTransform,
  resetCropTransform,
  settleCrop,
  zoomBy,
} from './coverCropTransform';

export interface CoverCropSheetProps {
  /** The picked image, or null when the sheet is closed. */
  source: CoverSource | null;
  onCancel: () => void;
  onConfirm: (rect: CropRect) => void;
}

/** As far in as the picture may be pushed. Past this it is pixels, not detail. */
const MAX_ZOOM = 6;

/**
 * Choose which square of a photograph becomes a playlist's cover.
 *
 * A cover is square and a photograph is not, so something has to decide what
 * gets cut. Before this, the app decided — `contentFit="cover"` took the middle
 * — which is right about half the time and wrong in the way that matters for
 * the half where the subject is not centred.
 *
 * The window stays put and the image moves under it, which is the arrangement
 * every photo app uses: the result is always exactly what is framed, and there
 * is no second rectangle on screen to reason about. It also means the crop is
 * *derived* from the transform rather than tracked alongside it — one
 * representation of one fact, which cannot drift when a gesture is interrupted.
 *
 * The image is laid out at the size that just covers the window and then
 * transformed, so `scale` is a multiplier on "as small as it is allowed to be"
 * and 1 is always the fully zoomed-out state. Clamping is done on gesture end
 * with a spring rather than during the drag: a finger that is stopped dead at a
 * boundary feels like the app has crashed, and letting it overshoot and settle
 * back is how every list in the app already behaves.
 */
export function CoverCropSheet({ source, onCancel, onConfirm }: CoverCropSheetProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  /** Side of the square window, measured — it depends on the screen. */
  const [window, setWindow] = useState(0);

  const width = source?.width ?? 0;
  const height = source?.height ?? 0;
  const base = baseScale(width, height, window);

  const onWindowLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    if (measured > 0) setWindow(measured);
  }, []);

  /*
   * The gestures only *call* things. Every write to the transform lives in
   * `coverCropTransform`, at module scope, because the React Compiler refuses a
   * write to any value a component closed over — a `useCallback`, a plain
   * function in the body and a gesture worklet are all the same to it.
   *
   * The dimensions have to be handed over rather than read there: they come
   * from the picked file and from a measured layout, neither of which a module
   * knows about.
   */
  const displayedWidth = width * base;
  const displayedHeight = height * base;

  const settle = () => {
    'worklet';
    settleCrop(displayedWidth * cropScale.value, displayedHeight * cropScale.value, window, MAX_ZOOM);
  };

  const pan = Gesture.Pan()
    .onStart(beginPan)
    .onUpdate((event) => {
      'worklet';
      dragBy(event.translationX, event.translationY);
    })
    .onEnd(settle);

  const pinch = Gesture.Pinch()
    .onStart(beginPinch)
    .onUpdate((event) => {
      'worklet';
      zoomBy(event.scale);
    })
    .onEnd(settle);

  // Simultaneous, so a two-finger gesture that drifts is a zoom *and* a pan
  // rather than whichever the recogniser happened to claim first.
  const gesture = Gesture.Simultaneous(pan, pinch);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: cropTx.value }, { translateY: cropTy.value }, { scale: cropScale.value }],
  }));

  const confirm = () => {
    if (!source) return;
    const { scale, tx, ty } = readCropTransform();
    onConfirm(
      cropRectFor({ window, imageWidth: source.width, imageHeight: source.height, scale, tx, ty }),
    );
  };

  return (
    <Modal
      visible={source !== null}
      animationType="slide"
      /* `onShow` rather than an effect: the sheet opening is an event, and it
         fires before the first frame, so a second pick never flashes the
         previous picture's framing. */
      onShow={resetCropTransform}
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
        <View className="flex-row items-center gap-1 px-4 pt-2">
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            className="min-h-11 min-w-11 items-center justify-center"
          >
            <X color={colors.label} size={24} strokeWidth={2} />
          </Pressable>

          <Text className="flex-1 font-display text-lg text-primary">
            {t('playlists.cover.cropTitle')}
          </Text>
        </View>

        {/*
          The window is square and as wide as the screen allows. Everything
          outside it is the surface colour rather than a dimmed copy of the
          picture: a mask needs the image drawn twice, and what is outside the
          square is not going to be in the cover — showing it faintly suggests
          otherwise.
        */}
        <View className="flex-1 items-center justify-center px-6">
          <View
            onLayout={onWindowLayout}
            className="aspect-square w-full overflow-hidden rounded-md bg-surface-elevated"
          >
            {source && window > 0 ? (
              <GestureDetector gesture={gesture}>
                <Animated.View
                  className="absolute items-center justify-center"
                  style={[
                    {
                      width: displayedWidth,
                      height: displayedHeight,
                      left: (window - displayedWidth) / 2,
                      top: (window - displayedHeight) / 2,
                    },
                    imageStyle,
                  ]}
                >
                  <Image
                    source={{ uri: source.uri }}
                    contentFit="fill"
                    transition={0}
                    cachePolicy="memory"
                    style={{ width: '100%', height: '100%' }}
                  />
                </Animated.View>
              </GestureDetector>
            ) : null}
          </View>

          <Text className="pt-4 text-center font-body text-sm text-muted">
            {t('playlists.cover.cropHint')}
          </Text>
        </View>

        <View className="flex-row gap-3 px-6 pb-2" style={{ paddingTop: SPACING[2] }}>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            className="min-h-11 flex-1 items-center justify-center rounded-sm border border-subtle px-4"
          >
            <Text className="font-body-medium text-base text-primary">{t('common.cancel')}</Text>
          </Pressable>

          <Pressable
            onPress={confirm}
            accessibilityRole="button"
            accessibilityLabel={t('playlists.cover.cropConfirm')}
            className="min-h-11 flex-1 items-center justify-center rounded-sm bg-accent px-4"
          >
            <Text className="font-body-medium text-base text-on-accent">
              {t('playlists.cover.cropConfirm')}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
