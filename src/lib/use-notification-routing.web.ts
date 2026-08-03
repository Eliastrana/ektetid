/**
 * The web build's stand-in for notification routing.
 *
 * There are no notifications on web, so there is nothing to route from — and
 * asking anyway is fatal rather than empty: `getLastNotificationResponse` has
 * no web implementation and throws, which is thrown from the root layout and
 * so takes the whole page down to a white screen.
 *
 * A no-op hook rather than an absent one, because the root layout calls it
 * unconditionally and should not have to know which platform it is on.
 */
export function useNotificationRouting(): void {}
