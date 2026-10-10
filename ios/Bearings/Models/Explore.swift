import Foundation

/// One option in a filter group — the vocabulary comes from lib/schools.ts
/// via the API, so labels never drift from the site.
struct FilterOption: Decodable, Hashable, Identifiable {
    let id: String
    let label: String

    private enum Key: String, CodingKey { case id, label }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Key.self)
        // COST_CAPS ids are numbers; everything else is a string.
        if let n = try? c.decode(Int.self, forKey: .id) { id = String(n) } else { id = try c.decode(String.self, forKey: .id) }
        label = try c.decode(String.self, forKey: .label)
    }
}

struct ExploreOptions: Decodable {
    let tiers: [FilterOption]
    let regions: [FilterOption]
    let sizes: [FilterOption]
    let settings: [FilterOption]
    let types: [FilterOption]
    let costCaps: [FilterOption]
    let sorts: [FilterOption]
}

struct ExploreRow: Decodable, Identifiable {
    var id: String { school.id }
    let school: School
    /// Nil on Free, where chances are Pro.
    let tier: ChanceTier?
    /// Empty on Free; optional for safety.
    let fitLabel: String?
    /// The average net price for this student — out-of-state tuition added
    /// at a public school in another state. Older servers don't send it.
    let netForYou: Double?
}

struct CounselorPick: Decodable, Identifiable {
    var id: String { school.id }
    let school: School
    let reason: String
}

struct ExploreResponse: Decodable {
    let needsProfile: Bool
    /// Free: the public directory only — no chances, fit, picks or "your price".
    let locked: Bool?
    let isParent: Bool?
    let total: Int?
    let page: Int?
    let pageCount: Int?
    let rows: [ExploreRow]?
    let picks: [CounselorPick]?
    let options: ExploreOptions
}

/// The explorer's query, in the same shape as the web's URL contract
/// (lib/schools.ts exploreParamsToQuery) — one search, two clients.
struct ExploreQuery: Equatable {
    var tiers: Set<String> = []
    var regions: Set<String> = []
    var sizes: Set<String> = []
    var settings: Set<String> = []
    var types: Set<String> = []
    var costCap = "0"
    var testOptionalOnly = false
    var q = ""
    var sort = "fit"
    var page = 1

    var filterCount: Int {
        tiers.count + regions.count + sizes.count + settings.count + types.count
            + (costCap == "0" ? 0 : 1) + (testOptionalOnly ? 1 : 0)
    }

    var items: [URLQueryItem] {
        var out: [URLQueryItem] = []
        func add(_ k: String, _ v: Set<String>) { if !v.isEmpty { out.append(.init(name: k, value: v.sorted().joined(separator: ","))) } }
        add("tier", tiers); add("region", regions); add("size", sizes); add("setting", settings); add("type", types)
        if costCap != "0" { out.append(.init(name: "cost", value: costCap)) }
        if testOptionalOnly { out.append(.init(name: "testopt", value: "1")) }
        let trimmed = q.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { out.append(.init(name: "q", value: trimmed)) }
        if sort != "fit" { out.append(.init(name: "sort", value: sort)) }
        if page > 1 { out.append(.init(name: "page", value: String(page))) }
        return out
    }

    mutating func clearFilters() {
        tiers = []; regions = []; sizes = []; settings = []; types = []
        costCap = "0"; testOptionalOnly = false; q = ""
    }
}

/// GET /api/v1/schools/:id
struct SchoolDetailResponse: Decodable {
    /// Free: published facts only — no chances, fit, or "your price".
    let locked: Bool?
    let school: School
    let chance: Chance?
    let fit: Fit?
    let estimate: Double?
    let residency: Residency?
    let deadline: DeadlineRef?
    let you: You?

    /// Where the student lives, and what that does to the price here
    /// (lib/residency.ts).
    struct Residency: Decodable {
        enum Status: String, Decodable { case unknown, inState = "in-state", outOfState = "out-of-state", exchange, `private` }
        let status: Status
        let homeState: String?
        let homeStateName: String?
        let extraPerYear: Double?
        let outOfStateExtraPerYear: Double?
        let program: Program?
        /// Exchanges that depend on their major or county — not counted in
        /// the estimate, worth asking about. Absent from older servers.
        let maybe: [Program]?

        struct Program: Decodable {
            let name: String
            let shortName: String
            let terms: String
            let howToGet: String
            let restrictions: String?
            let url: String?
        }
    }

    struct Chance: Decodable { let tier: ChanceTier; let confidence: String; let caveat: String? }
    struct Fit: Decodable { let label: String; let reasons: [String] }
    struct DeadlineRef: Decodable { let plan: String; let date: String }
    struct You: Decodable { let gpaUnweighted: Double?; let sat: Double? }
}

/// A school to navigate to, from anywhere in the app.
struct SchoolRoute: Hashable {
    let id: String
}
