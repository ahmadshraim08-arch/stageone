import React, { useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";

const MIN = -2000;
const MAX = 2000;
const STEP = 250;
const THUMB_SIZE = 24;
const TRACK_HEIGHT = 4;
const TOUCH_AREA_HEIGHT = 44;

interface TimingSliderProps {
  value: number;
  onChangeValue: (v: number) => void;
  primaryColor: string;
  borderColor: string;
  mutedForeground: string;
}

export function TimingSlider({
  value,
  onChangeValue,
  primaryColor,
  borderColor,
  mutedForeground,
}: TimingSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const startValueRef = useRef(value);
  const currentValueRef = useRef(value);
  currentValueRef.current = value;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startValueRef.current = currentValueRef.current;
      },
      onPanResponderMove: (_, { dx }) => {
        const tw = trackWidthRef.current;
        const activeWidth = tw - THUMB_SIZE;
        if (activeWidth <= 0) return;
        const deltaValue = (dx / activeWidth) * (MAX - MIN);
        const rawValue = startValueRef.current + deltaValue;
        const stepped = Math.round(rawValue / STEP) * STEP;
        onChangeValue(Math.max(MIN, Math.min(MAX, stepped)));
      },
    }),
  ).current;

  const fillRatio = Math.max(0, Math.min(1, (value - MIN) / (MAX - MIN)));
  const activeWidth = Math.max(0, trackWidth - THUMB_SIZE);
  const thumbLeft = fillRatio * activeWidth;
  const fillWidth = thumbLeft + THUMB_SIZE / 2;

  return (
    <View testID="timing-slider-container">
      <View
        testID="timing-slider-track"
        style={styles.touchArea}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          trackWidthRef.current = w;
          setTrackWidth(w);
        }}
        {...panResponder.panHandlers}
      >
        <View style={[styles.trackBg, { backgroundColor: borderColor }]} />
        {trackWidth > 0 && (
          <View style={[styles.trackFill, { width: fillWidth, backgroundColor: primaryColor }]} />
        )}
        {trackWidth > 0 && (
          <View style={[styles.thumb, { left: thumbLeft, backgroundColor: primaryColor }]} />
        )}
      </View>
      <View style={styles.labelRow}>
        <Text style={[styles.labelText, { color: mutedForeground }]}>−2000 ms</Text>
        <Text style={[styles.labelText, { color: mutedForeground }]}>+2000 ms</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    height: TOUCH_AREA_HEIGHT,
    justifyContent: "center",
  },
  trackBg: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  trackFill: {
    position: "absolute",
    left: 0,
    top: (TOUCH_AREA_HEIGHT - TRACK_HEIGHT) / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    top: (TOUCH_AREA_HEIGHT - THUMB_SIZE) / 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  labelText: { fontSize: 11 },
});
