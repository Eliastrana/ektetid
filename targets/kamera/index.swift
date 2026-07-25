import SwiftUI
import WidgetKit

/// The widget shows the same thing forever, so the entry carries only the date
/// WidgetKit requires of it.
struct ShutterEntry: TimelineEntry {
  let date: Date
}

/// A single entry that never expires.
///
/// There is nothing to refresh — no photo, no count, no session — so the
/// timeline is one entry with a `.never` policy. Anything else would wake the
/// extension on a schedule to redraw an identical view, spending the user's
/// battery to no effect.
struct ShutterProvider: TimelineProvider {
  func placeholder(in context: Context) -> ShutterEntry {
    ShutterEntry(date: Date())
  }

  func getSnapshot(in context: Context, completion: @escaping (ShutterEntry) -> Void) {
    completion(ShutterEntry(date: Date()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<ShutterEntry>) -> Void) {
    completion(Timeline(entries: [ShutterEntry(date: Date())], policy: .never))
  }
}

struct ShutterWidgetView: View {
  var body: some View {
    VStack(spacing: 10) {
      // The shutter ring from the camera screen, redrawn rather than shipped
      // as an image so it stays crisp at every widget scale.
      ZStack {
        Circle()
          .strokeBorder(Color.white, lineWidth: 3)
          .frame(width: 54, height: 54)
        Circle()
          .fill(Color.white)
          .frame(width: 42, height: 42)
      }

      Text("Ta bilde")
        .font(.system(size: 15, weight: .medium))
        .foregroundStyle(.white)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    // iOS 17+ draws widget backgrounds through this rather than a plain view,
    // and removes the padding it would otherwise inset the content by.
    .containerBackground(for: .widget) {
      Color.black
    }
    /*
     * The whole widget is the tap target.
     *
     * Applied to the outermost view so any press anywhere opens the app, which
     * is what a shortcut widget should do — a small hit area inside a square
     * that looks entirely tappable is worse than no widget. The app already
     * resolves this path to the camera tab through expo-router.
     */
    .widgetURL(URL(string: "ektetid:///kamera"))
  }
}

@main
struct ShutterWidget: Widget {
  let kind = "EkteTidKamera"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: ShutterProvider()) { _ in
      ShutterWidgetView()
    }
    .configurationDisplayName("Ta bilde")
    .description("Åpner kameraet i EkteTid med ett trykk.")
    // Square only. The wide and tall families would stretch a design that is
    // one button and a label, with nothing to fill the extra room.
    .supportedFamilies([.systemSmall])
  }
}
