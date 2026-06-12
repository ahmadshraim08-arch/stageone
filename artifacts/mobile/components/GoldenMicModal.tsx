import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

interface Package {
  quantity: number;
  price: string;
  label: string;
  popular?: boolean;
}

const PACKAGES: Package[] = [
  { quantity: 1, price: "$0.99", label: "1 Golden Mic" },
  { quantity: 5, price: "$3.99", label: "5 Golden Mics" },
  { quantity: 15, price: "$9.99", label: "15 Golden Mics", popular: true },
  { quantity: 50, price: "$24.99", label: "50 Golden Mics" },
  { quantity: 100, price: "$39.99", label: "100 Golden Mics" },
];

interface Props {
  visible: boolean;
  musicMinuteId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function GoldenMicModal({ visible, musicMinuteId, onClose, onSuccess }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, sendGoldenMic, addGoldenMics } = useApp();
  const [selected, setSelected] = useState<Package | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchased, setPurchased] = useState(false);

  const balance = currentUser?.goldenMicBalance ?? 0;
  const canSendFree = balance > 0;

  const handleSendFree = () => {
    if (!musicMinuteId) return;
    const ok = sendGoldenMic(musicMinuteId);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
      onClose();
    }
  };

  const handleSimulatePurchase = async () => {
    if (!selected) return;
    setPurchasing(true);
    await new Promise((r) => setTimeout(r, 1200));
    addGoldenMics(selected.quantity);
    setPurchasing(false);
    setPurchased(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      setPurchased(false);
      setSelected(null);
    }, 1800);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={styles.handle} />

        <View style={styles.header}>
          <MaterialCommunityIcons name="microphone" size={36} color={colors.gold} style={styles.micIcon} />
          <Text style={[styles.title, { color: colors.foreground }]}>Golden Mic</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            A Golden Mic means: "I believe this singer deserves to rise."
          </Text>
        </View>

        {purchased ? (
          <View style={styles.successView}>
            <Ionicons name="checkmark-circle" size={56} color={colors.gold} />
            <Text style={[styles.successText, { color: colors.gold }]}>
              Golden Mics added!
            </Text>
          </View>
        ) : (
          <>
            {canSendFree && (
              <TouchableOpacity
                onPress={handleSendFree}
                activeOpacity={0.85}
                style={styles.sendFreeBtn}
              >
                <LinearGradient
                  colors={["#F59E0B", "#D97706", "#B45309"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.sendFreeGradient}
                >
                  <MaterialCommunityIcons name="microphone" size={20} color="#fff" />
                  <Text style={styles.sendFreeText}>
                    Send 1 Golden Mic (Balance: {balance})
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            <View style={[styles.divider, { borderColor: colors.border }]}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.mutedForeground, backgroundColor: colors.card }]}>
                {canSendFree ? "or get more" : "Get Golden Mics"}
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            <View style={styles.packages}>
              {PACKAGES.map((pkg) => (
                <TouchableOpacity
                  key={pkg.quantity}
                  onPress={() => setSelected(pkg)}
                  activeOpacity={0.8}
                  style={[
                    styles.packageRow,
                    {
                      backgroundColor:
                        selected?.quantity === pkg.quantity
                          ? `${colors.gold}20`
                          : colors.muted,
                      borderColor:
                        selected?.quantity === pkg.quantity
                          ? colors.gold
                          : colors.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="microphone"
                    size={20}
                    color={selected?.quantity === pkg.quantity ? colors.gold : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.packageLabel,
                      {
                        color:
                          selected?.quantity === pkg.quantity
                            ? colors.gold
                            : colors.foreground,
                      },
                    ]}
                  >
                    {pkg.label}
                  </Text>
                  {pkg.popular && (
                    <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.popularText}>Popular</Text>
                    </View>
                  )}
                  <Text
                    style={[
                      styles.packagePrice,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {pkg.price}
                  </Text>
                  {selected?.quantity === pkg.quantity && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.gold} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {selected && (
              <TouchableOpacity
                onPress={handleSimulatePurchase}
                activeOpacity={0.85}
                disabled={purchasing}
              >
                <LinearGradient
                  colors={["#A855F7", "#EC4899", "#F59E0B"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.purchaseBtn}
                >
                  <Text style={styles.purchaseBtnText}>
                    {purchasing ? "Processing..." : `Get ${selected.label} — ${selected.price}`}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
              Musicathon demo: Golden Mic purchases are simulated. No real money is collected.
            </Text>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  micIcon: {
    shadowColor: "#F59E0B",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  sendFreeBtn: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: "hidden",
  },
  sendFreeGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  sendFreeText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 12,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    paddingHorizontal: 4,
  },
  packages: {
    gap: 8,
    marginBottom: 12,
  },
  packageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  packageLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  popularBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  popularText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  packagePrice: {
    fontSize: 13,
    fontWeight: "600",
  },
  purchaseBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  purchaseBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  disclaimer: {
    fontSize: 10,
    textAlign: "center",
    lineHeight: 14,
    marginBottom: 4,
  },
  successView: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  successText: {
    fontSize: 20,
    fontWeight: "700",
  },
});
