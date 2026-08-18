import * as Haptics from 'expo-haptics';
import * as Device from 'expo-device';
import {
  ErrorCode,
  finishTransaction as finishIapTransaction,
  useIAP,
  type Purchase,
  type UseIAPOptions,
} from 'expo-iap';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

import { ErrorNotice } from '@/components/error-notice';
import {
  fetchProProgress,
  PRO_PRODUCT_ID,
  verifyProPurchase,
  type ProProgress,
} from '@/lib/pro';

type StoreStatus = 'connecting' | 'loading' | 'ready' | 'unavailable' | 'error';

type IapErrorLike = {
  code?: ErrorCode;
  message?: string;
};

function asIapError(error: unknown): IapErrorLike {
  return typeof error === 'object' && error !== null ? (error as IapErrorLike) : {};
}

function purchaseErrorMessage(error: unknown): string {
  const { code } = asIapError(error);

  switch (code) {
    case ErrorCode.AlreadyOwned:
      return 'Du eier allerede Pro. Trykk Gjenopprett kjøp for å aktivere det på denne kontoen.';
    case ErrorCode.NetworkError:
    case ErrorCode.RemoteError:
    case ErrorCode.ServiceDisconnected:
    case ErrorCode.ServiceTimeout:
      return 'Butikken svarer ikke akkurat nå. Sjekk nettet og prøv igjen.';
    case ErrorCode.IapNotAvailable:
    case ErrorCode.BillingUnavailable:
    case ErrorCode.FeatureNotSupported:
      return 'Kjøp er ikke tilgjengelig på denne enheten eller Apple-kontoen.';
    case ErrorCode.ItemUnavailable:
    case ErrorCode.SkuNotFound:
    case ErrorCode.NotPrepared:
      return 'Pro-produktet er ikke tilgjengelig i butikken ennå.';
    default:
      return 'Butikken kunne ikke fullføre kjøpet. Prøv igjen om litt.';
  }
}

function unavailableProductMessage(): string {
  if (__DEV__ && Platform.OS === 'ios' && !Device.isDevice) {
    return 'Pro-produktet finnes ikke i simulatorens StoreKit-oppsett. Test kjøpet i TestFlight, eller aktiver en StoreKit-konfigurasjon i Xcode.';
  }
  return 'Pro-produktet er ikke tilgjengelig i App Store ennå.';
}

export function ProCard({
  userId,
  onProChange,
}: {
  userId: string;
  onProChange?: (isPro: boolean) => void;
}) {
  const [progress, setProgress] = useState<ProProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeStatus, setStoreStatus] = useState<StoreStatus>('connecting');
  const [productQueryComplete, setProductQueryComplete] = useState(false);
  const [storeReloadKey, setStoreReloadKey] = useState(0);

  const refresh = useCallback(async () => {
    const next = await fetchProProgress(userId);
    setProgress(next);
    onProChange?.(next.isPro);
  }, [onProChange, userId]);

  const finishVerified = useCallback(
    async (purchase: Purchase) => {
      if (purchase.productId !== PRO_PRODUCT_ID) return;
      setBusy(true);
      setError(null);
      try {
        await verifyProPurchase(purchase);
        await finishIapTransaction({ purchase, isConsumable: false });
        await refresh();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        setError('Kjøpet ble registrert, men kunne ikke bekreftes. Prøv Gjenopprett kjøp.');
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const purchaseFailed = useCallback((
    purchaseError: Parameters<NonNullable<UseIAPOptions['onPurchaseError']>>[0]
  ) => {
    setBusy(false);
    if (purchaseError.code !== ErrorCode.UserCancelled) {
      setError(purchaseErrorMessage(purchaseError));
    }
  }, []);

  const {
    connected,
    products,
    fetchProducts,
    requestPurchase,
    reconnect,
    restorePurchases,
  } = useIAP({
    onPurchaseSuccess: (purchase) => void finishVerified(purchase),
    onPurchaseError: purchaseFailed,
    onError: (storeError) => {
      setStoreStatus('error');
      setError(purchaseErrorMessage(storeError));
    },
  });

  useEffect(() => {
    void refresh().catch(() => setError('Klarte ikke å hente Pro-status.'));
  }, [refresh]);

  useEffect(() => {
    let active = true;

    if (!connected) {
      setStoreStatus('connecting');
      setProductQueryComplete(false);
      return () => {
        active = false;
      };
    }

    setStoreStatus('loading');
    setProductQueryComplete(false);
    void fetchProducts({ skus: [PRO_PRODUCT_ID], type: 'in-app' })
      .then(() => {
        if (active) setProductQueryComplete(true);
      })
      .catch((storeError: unknown) => {
        if (!active) return;
        setStoreStatus('error');
        setError(purchaseErrorMessage(storeError));
      });

    return () => {
      active = false;
    };
  }, [connected, fetchProducts, storeReloadKey]);

  const product = products.find((item) => item.id === PRO_PRODUCT_ID);

  useEffect(() => {
    if (!connected || !productQueryComplete) return;
    if (product) {
      setStoreStatus('ready');
    } else {
      setStoreStatus('unavailable');
      setError(unavailableProductMessage());
    }
  }, [connected, product, productQueryComplete]);

  const retryStore = useCallback(async () => {
    setError(null);
    setStoreStatus('loading');
    if (connected || (await reconnect())) {
      setStoreReloadKey((value) => value + 1);
      return;
    }
    setStoreStatus('error');
    setError('Kunne ikke koble til butikken. Sjekk nettet og prøv igjen.');
  }, [connected, reconnect]);

  const canPurchase = connected && storeStatus === 'ready' && !!product && !busy;
  const purchaseLabel = product
    ? `Kjøp for ${product.displayPrice}`
    : storeStatus === 'connecting' || storeStatus === 'loading'
      ? 'Laster butikk…'
      : 'Pro er ikke tilgjengelig';
  const postsLeft = Math.max(0, 20 - (progress?.postCount ?? 0));
  const albumsLeft = Math.max(0, 3 - (progress?.albumCount ?? 0));

  return (
    <View className="overflow-hidden rounded-tile border border-ink bg-glass p-4">
      <View className="flex-row items-center gap-3">
        <View className="h-9 items-center justify-center rounded-full border border-ink px-3">
          <Text className="text-[11px] font-semibold tracking-widest text-ink">PRO</Text>
        </View>
        <View className="flex-1">
          <Text className="text-lg text-ink">EkteTid Pro</Text>
          <Text className="text-xs text-ink">Engangskjøp · ingen abonnement</Text>
        </View>
      </View>

      <View className="mt-4 gap-2">
        <ProFeature icon="memories" label="Minneblikk og oppsummeringer" />
        <ProFeature icon="photo.on.rectangle.angled" label="Cover, farge og layout på album" />
        <ProFeature icon="square.and.arrow.down" label="Automatisk lokalt EkteTid-arkiv i Bilder" />
        <ProFeature icon="eye" label="Se hvem som har sett innleggene dine" />
      </View>

      {progress?.isPro ? (
        <View className="mt-4 rounded-xl bg-surface-raised p-3">
          <Text className="text-sm text-ink">Pro er låst opp ✓</Text>
          <Text className="mt-1 text-xs text-muted">
            {progress.purchased ? 'Kjøpet ditt er permanent.' : 'Låst opp med 20 innlegg i minst 3 album.'}
          </Text>
        </View>
      ) : (
        <>
          <Text className="mt-4 text-sm leading-5 text-muted">
            Få mest mulig ut av EkteTid med Pro! Lurer du på hva du kan gjøre med Pro? Det gjør jeg og!
          </Text>
          <Text className="mt-3 text-xs text-muted">
            Gratis fremdrift: {postsLeft} innlegg og {albumsLeft} album gjenstår.
          </Text>
          {error ? (
            <View className="mt-3">
              <ErrorNotice message={error} />
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPurchase, busy }}
            disabled={!canPurchase}
            onPress={() => {
              if (!product) return;
              setBusy(true);
              setError(null);
              void requestPurchase({
                request: {
                  apple: { sku: product.id, appAccountToken: userId },
                  google: { skus: [product.id], obfuscatedAccountId: userId },
                },
                type: 'in-app',
              }).catch((purchaseError: unknown) => {
                setBusy(false);
                setError(purchaseErrorMessage(purchaseError));
              });
            }}
            className={`mt-4 h-12 items-center justify-center rounded-xl ${
              canPurchase ? 'bg-ink' : 'bg-surface-raised'
            }`}>
            {busy ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text className={canPurchase ? 'text-base text-canvas' : 'text-base text-muted'}>
                {purchaseLabel}
              </Text>
            )}
          </Pressable>
          {storeStatus === 'unavailable' || storeStatus === 'error' ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void retryStore()}>
              <Text className="pt-3 text-center text-xs text-ink">
                Prøv butikken på nytt
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={!connected || busy}
            onPress={() => {
              setBusy(true);
              void restorePurchases()
                .catch(() => setError('Fant ingen kjøp å gjenopprette.'))
                .finally(() => setBusy(false));
            }}>
            <Text className="pt-3 text-center text-xs text-muted">Gjenopprett kjøp</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

type ProFeatureIcon =
  | 'memories'
  | 'photo.on.rectangle.angled'
  | 'square.and.arrow.down'
  | 'eye';

function ProFeature({ icon, label }: { icon: ProFeatureIcon; label: string }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <SymbolView
        name={icon}
        size={13}
        tintColor="#ffffff"
        fallback={<Text className="text-xs text-ink">✓</Text>}
      />
      <Text className="text-sm text-muted">{label}</Text>
    </View>
  );
}
