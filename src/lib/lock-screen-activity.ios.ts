import EkteTidActivity from '@/widgets/ektetid-activity';

export function isLockScreenActivityEnabled(): boolean {
  return EkteTidActivity.getInstances().length > 0;
}

export async function setLockScreenActivityEnabled(
  enabled: boolean,
  displayName?: string | null
): Promise<void> {
  const active = EkteTidActivity.getInstances();
  if (!enabled) {
    await Promise.all(active.map((instance) => instance.end('immediate')));
    return;
  }

  const props = {
    title: 'Det er tid for å være ekte',
    detail: displayName ? `Ta vare på øyeblikket, ${displayName}` : 'Ta vare på øyeblikket',
  };
  if (active[0]) {
    await active[0].update(props);
    return;
  }
  EkteTidActivity.start(props, 'ektetid:///kamera');
}
