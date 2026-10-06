import Foundation

enum Config {
    /// The server the app talks to. Debug points at `npm run dev` on
    /// localhost; Release at production. Set in the project's build settings
    /// as BEARINGS_API_BASE_URL and passed through Info.plist.
    static let apiBaseURL: URL = {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "BearingsAPIBaseURL") as? String,
            let url = URL(string: raw)
        else {
            fatalError("BearingsAPIBaseURL is missing from Info.plist")
        }
        return url
    }()
}
