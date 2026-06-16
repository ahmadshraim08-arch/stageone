import React, { useEffect } from "react";
import { StyleSheet, View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

interface Props {
  stageLabel: string;
}

const BAR_COUNT = 9;
const BASE_HEIGHT = 8;
const MAX_HEIGHT = 44;

function WaveBar({ index, primaryColor }: { index: number; primaryColor: string }) {
  const height = useSharedValue(BASE_HEIGHT);

  useEffect(() => {
    const randomTarget = BASE_HEIGHT + Math.random() * (MAX_HEIGHT - BASE_HEIGHT);
    const duration = 350 + Math.random() * 300;
    const delay = index * 70;

    height.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(randomTarget, { duration, easing: Easing.inOut(Easing.sin) }),
          withTiming(BASE_HEIGHT + Math.random() * 12, { duration: duration * 0.8, easing: Easing.inOut(Easing.sin) }),
          withTiming(BASE_HEIGHT + Math.random() * (MAX_HEIGHT - BASE_HEIGHT), { duration: duration * 1.1, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  const opacity = 0.55 + (index / (BAR_COUNT - 1)) * 0.45;

  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: primaryColor, opacity },
        animatedStyle,
      ]}
    />
  );
}

function FloatingNote({ delay, startX, primaryColor }: { delay: number; startX: number; primaryColor: string }) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const run = () => {
      translateY.value = 0;
      opacity.value = 0;
      const totalDuration = 2200 + Math.random() * 800;

      opacity.value = withDelay(
        delay,
        withSequence(
          withTiming(0.9, { duration: 400, easing: Easing.out(Easing.quad) }),
          withTiming(0.9, { duration: totalDuration - 800 }),
          withTiming(0, { duration: 400, easing: Easing.in(Easing.quad) }),
        ),
      );
      translateY.value = withDelay(
        delay,
        withTiming(-70, { duration: totalDuration, easing: Easing.out(Easing.quad) }),
      );
    };

    run();
    const interval = setInterval(run, 2800 + delay);
    return () => clearInterval(interval);
  }, []);

  const noteStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const notes = ["♪", "♩", "♫", "♬"];
  const note = notes[Math.floor(startX * notes.length) % notes.length];

  return (
    <Animated.Text
      style={[
        styles.noteText,
        { color: primaryColor, left: startX * 140 + 20 },
        noteStyle,
      ]}
    >
      {note}
    </Animated.Text>
  );
}

const NOTE_CONFIGS = [
  { delay: 0, startX: 0.05 },
  { delay: 700, startX: 0.35 },
  { delay: 1400, startX: 0.65 },
  { delay: 300, startX: 0.88 },
];

export function AnalysisWaveform({ stageLabel }: Props) {
  const colors = useColors();

  return (
    <View style={styles.container}>
      <View style={styles.notesContainer}>
        {NOTE_CONFIGS.map((cfg, i) => (
          <FloatingNote
            key={i}
            delay={cfg.delay}
            startX={cfg.startX}
            primaryColor={colors.primary}
          />
        ))}
      </View>

      <View style={styles.barsRow}>
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <WaveBar key={i} index={i} primaryColor={colors.primary} />
        ))}
      </View>

      <Animated.Text
        key={stageLabel}
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(200)}
        style={[styles.stageText, { color: colors.mutedForeground }]}
        numberOfLines={1}
      >
        {stageLabel}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  notesContainer: {
    position: "relative",
    width: 180,
    height: 70,
  },
  noteText: {
    position: "absolute",
    bottom: 0,
    fontSize: 22,
    fontWeight: "600",
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
    height: MAX_HEIGHT + 4,
  },
  bar: {
    width: 7,
    borderRadius: 4,
  },
  stageText: {
    fontSize: 13,
    textAlign: "center",
    letterSpacing: 0.1,
  },
});
