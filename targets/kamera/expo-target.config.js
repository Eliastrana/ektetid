/**
 * The "Ta bilde" home screen widget.
 *
 * A square shortcut straight into the camera tab. It holds no state and shows
 * no data, so it needs neither an App Group nor any of the app's Supabase
 * session — it is a button, and everything it does happens through the
 * `ektetid://` deep link.
 *
 * @type {import('@bacons/apple-targets/app.plugin').Config}
 */
module.exports = {
  type: 'widget',
  name: 'kamera',
  displayName: 'Ta bilde',

  /*
   * 17.0 rather than the plugin's default of 18.0.
   *
   * The widget uses `containerBackground`, which iOS 17 both introduced and
   * requires — widgets that do not adopt it are not drawn correctly there.
   * Defaulting to 18.0 would have hidden the widget from anyone a major
   * version behind for no gain, and the app itself targets 16.4.
   */
  deploymentTarget: '17.0',

  frameworks: ['SwiftUI', 'WidgetKit'],

  // Appended to the app's identifier: com.eliastrana.ektetid.widget
  bundleIdentifier: '.widget',

  colors: {
    $accent: '#ffffff',
    $widgetBackground: '#000000',
  },
};
