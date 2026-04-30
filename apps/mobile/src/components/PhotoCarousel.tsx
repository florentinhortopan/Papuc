import { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

const { width } = Dimensions.get("window");

export function PhotoCarousel({
  photos,
  height = 220,
  cardWidth,
}: {
  photos: string[];
  height?: number;
  cardWidth?: number;
}) {
  const [index, setIndex] = useState(0);
  const ref = useRef<FlatList>(null);
  const w = cardWidth ?? width - 32;

  if (!photos.length) {
    return (
      <View
        className="rounded-xl bg-surfaceAlt border border-border items-center justify-center"
        style={{ height, width: w }}
      >
        <Text className="text-textMuted text-xs">No photos</Text>
      </View>
    );
  }

  function onMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / w);
    setIndex(i);
  }

  return (
    <View>
      <FlatList
        ref={ref}
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(uri, i) => `${i}:${uri}`}
        onMomentumScrollEnd={onMomentumScrollEnd}
        renderItem={({ item }) => (
          <Image
            source={{ uri: item }}
            style={{ width: w, height }}
            className="rounded-xl"
            resizeMode="cover"
          />
        )}
      />
      {photos.length > 1 ? (
        <View className="absolute right-3 bottom-3 bg-black/60 rounded-full px-2 py-1">
          <Text className="text-white text-xs">
            {index + 1}/{photos.length}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
