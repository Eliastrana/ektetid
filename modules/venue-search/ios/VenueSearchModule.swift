import ExpoModulesCore
import MapKit

/**
 Finds places to eat and drink near a coordinate, using Apple's own map data.

 `MKLocalPointsOfInterestRequest` rather than `MKLocalSearch`: this asks "what
 is around here, of these kinds" instead of matching a search string, which is
 the question a photograph's coordinates actually pose. There is no query to
 invent from a location, and a text search for "restaurant" returns the places
 whose names contain the word.

 Apple-only by design. MapKit has no equivalent off Apple platforms, and the
 alternative — a third-party place API — would mean two sources of truth for
 the same field. The JavaScript side reports the feature as unavailable
 elsewhere rather than pretending with worse data.
 */
public class VenueSearchModule: Module {
  /**
   The kinds of place worth suggesting under a photograph.

   Deliberately food and drink only. Including every category would offer to
   tag a photo of dinner with the dentist next door, and the field exists to
   review somewhere you ate.
   */
  private static let categories: [MKPointOfInterestCategory] = [
    .restaurant,
    .cafe,
    .bakery,
    .brewery,
    .winery,
    .nightlife,
    .foodMarket
  ]

  public func definition() -> ModuleDefinition {
    Name("VenueSearch")

    /**
     Nearby venues, nearest first.

     `radius` is in metres. MapKit caps a points-of-interest request at 50km,
     but the useful range here is a couple of hundred metres: the question is
     which venue you are standing in, not which ones are in the city.
     */
    AsyncFunction("searchVenues") { (
      latitude: Double,
      longitude: Double,
      radius: Double,
      promise: Promise
    ) in
      let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
      let request = MKLocalPointsOfInterestRequest(center: center, radius: radius)
      request.pointOfInterestFilter = MKPointOfInterestFilter(
        including: Self.categories
      )

      MKLocalSearch(request: request).start { response, error in
        if let error {
          // A search that finds nothing resolves with an empty response; an
          // error here is a real failure — no network, or MapKit throttling.
          promise.reject("VENUE_SEARCH_FAILED", error.localizedDescription)
          return
        }

        let origin = CLLocation(latitude: latitude, longitude: longitude)

        let venues = (response?.mapItems ?? []).compactMap { item -> [String: Any?]? in
          // A place with no name is nothing anyone could choose from a list.
          guard let name = item.name else { return nil }
          let placemark = item.placemark
          guard let coordinate = placemark.location?.coordinate else { return nil }

          return [
            "name": name,
            "category": item.pointOfInterestCategory?.rawValue,
            // Street and area, which is what distinguishes two branches of the
            // same chain in a list of names.
            "address": [placemark.thoroughfare, placemark.locality]
              .compactMap { $0 }
              .joined(separator: ", "),
            "latitude": coordinate.latitude,
            "longitude": coordinate.longitude,
            "distance": placemark.location?.distance(from: origin)
          ]
        }

        /*
         Sorted here rather than trusted from MapKit.

         The response is not documented as ordered by distance, and the whole
         point of the list is that the nearest thing is probably where you are.
         */
        let sorted = venues.sorted { left, right in
          let a = (left["distance"] as? Double) ?? .greatestFiniteMagnitude
          let b = (right["distance"] as? Double) ?? .greatestFiniteMagnitude
          return a < b
        }

        promise.resolve(sorted)
      }
    }
  }
}
