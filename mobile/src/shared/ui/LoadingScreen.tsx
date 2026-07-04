import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '@/shared/theme/tokens';

export function LoadingScreen() {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
