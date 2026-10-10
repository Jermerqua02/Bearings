import Foundation

/*
  Mirrors of lib/types.ts — the same shapes the website renders from,
  decoded straight off /api/v1. Only the fields the app uses so far are
  declared; JSONDecoder ignores the rest, so the server can add fields
  without breaking older builds.

  Anything the TS marks optional is optional here. For schools especially,
  `nil` means "not reported", and the UI must say so rather than print 0.
*/

enum Role: String, Codable {
    case student, parent, admin
}

struct Viewer: Codable, Equatable {
    let id: String
    let name: String
    let email: String
    let role: Role
    /// When the profile photo last changed; nil if there isn't one.
    let avatarUpdatedAt: String?
    /// Free or Pro. Nil from a server older than Pro, where everything was open.
    var plan: Plan?
}

/// Free or Pro, and why (docs/plans/lumni-pro.md). Free is the public
/// directory and a one-time sample of the counselor; everything about the
/// student is Pro.
struct Plan: Codable, Equatable {
    let tier: String
    /// "app_store", "admin", "free_access", "school" or "staff".
    let source: String?
    let endsAt: String?
    let inTrial: Bool?
    /// "own", or "family" when it's shared from a linked parent or student.
    let via: String?
    /// What's left of the Free sample; nil on Pro.
    var sample: Sample?
    /// An admin removed Pro from this account: nothing it buys would count.
    var blocked: Bool?

    struct Sample: Codable, Equatable {
        var chat: Int
        var interview: Int
    }

    var isPro: Bool { tier == "pro" }
}

enum GradeMode: String, Codable {
    case build, explore, apply, decide

    var label: String { rawValue.capitalized }

    /// Port of gradeModeFor() in lib/types.ts.
    static func forGrade(_ grade: Int, date: Date = .now) -> GradeMode {
        if grade <= 10 { return .build }
        if grade == 11 { return .explore }
        let month = Calendar.current.component(.month, from: date) // 1-indexed
        return month >= 8 || month == 1 ? .apply : .decide
    }
}

// MARK: Profile

enum Profile: Decodable {
    case student(StudentProfile)
    case parent(ParentProfile)

    private enum Key: String, CodingKey { case role }

    init(from decoder: Decoder) throws {
        let role = try decoder.container(keyedBy: Key.self).decode(String.self, forKey: .role)
        self = role == "parent"
            ? .parent(try ParentProfile(from: decoder))
            : .student(try StudentProfile(from: decoder))
    }

    var firstName: String {
        switch self {
        case .student(let s): s.firstName
        case .parent(let p): p.firstName
        }
    }

    var mode: GradeMode {
        switch self {
        case .student(let s): .forGrade(s.gradeLevel)
        case .parent(let p): .forGrade(p.studentGrade)
        }
    }
}

struct StudentProfile: Decodable {
    let firstName: String
    let gradeLevel: Int
    let intendedMajors: [String]
    /// Two-letter code; nil until they've told us.
    let homeState: String?
}

struct ParentProfile: Decodable {
    let firstName: String
    let studentGrade: Int
}

// MARK: Schools

enum ChanceTier: String, Codable, CaseIterable {
    case reach, target, likely
    var label: String { rawValue.capitalized }
}

enum ApplicationPlan: String, Codable, CaseIterable {
    case ED, ED2, EA, REA, RD, rolling
    var label: String { self == .rolling ? "Rolling" : rawValue }
}

/// Mirrors School in lib/types.ts — the whole thing, because the detail
/// screen shows nearly all of it. Numbers are Double throughout: Postgres
/// numerics arrive as JSON numbers that may or may not be integral.
struct School: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let shortName: String
    let city: String
    let state: String
    let region: String?
    let type: String?
    let setting: String?
    let size: String?
    let undergradEnrollment: Double?
    let admissions: Admissions
    let cost: Cost
    let academics: Academics?
    let life: Life?
    let cityInfo: CityInfo?
    let outcomes: Outcomes?
    let underratedFor: String?
    let application: Application?

    static func == (a: School, b: School) -> Bool { a.id == b.id }
    func hash(into h: inout Hasher) { h.combine(id) }

    struct Admissions: Codable {
        let acceptanceRate: Double?
        let gpaMid50: [Double]?
        let satMid50: [Double]?
        let actMid50: [Double]?
        let testPolicy: String?
        let plansOffered: [ApplicationPlan]
        /// Plan → ISO date.
        let deadlines: [String: String]
    }

    struct Cost: Codable {
        let stickerPrice: Double?
        let avgNetPrice: Double?
        let netPriceByIncome: IncomeBands?
        let percentNeedMet: Double?
        let meritAid: String?
        /// Published tuition and fees, by residency.
        let tuitionInState: Double?
        let tuitionOutOfState: Double?
    }

    struct IncomeBands: Codable {
        let under48k: Double?
        let k48to75: Double?
        let k75to110: Double?
        let over110k: Double?
    }

    struct Academics: Codable {
        let topMajors: [String]?
        let studentFacultyRatio: String?
        let notablePrograms: [String]?
        let researchOpportunities: Bool?
        let coOp: Bool?
    }

    struct Life: Codable {
        let vibe: String?
        let greekLifePresence: String?
        let d1Athletics: Bool?
        let housingGuaranteed: Double?
        let weather: String?
        let commonComplaints: String?
        let religiousAffiliation: String?
    }

    struct CityInfo: Codable {
        let costOfLiving: String?
        let transit: String?
        let airportAccess: String?
        let internshipMarket: String?
        let thingsToDo: String?
    }

    struct Outcomes: Codable {
        /// Within six years.
        let gradRate: Double?
        /// On time, within four.
        let gradRate4yr: Double?
        let medianEarnings10yr: Double?
        let alumniNetwork: String?
    }

    struct Application: Codable {
        let url: String?
        let netPriceCalculatorUrl: String?
    }

    var logoURL: URL { Config.apiBaseURL.appending(path: "api/school-logo/\(id)") }
}

// MARK: List

struct ListEntry: Codable, Identifiable {
    var id: String { schoolId }
    let schoolId: String
    var tier: ChanceTier
    var plan: ApplicationPlan?
    var status: Status
    var outcome: Outcome?
    var notes: String?

    enum Status: String, Codable, CaseIterable {
        case considering, applying, inProgress = "in-progress", submitted
        case materialsReceived = "materials-received", decision

        var label: String {
            switch self {
            case .considering: "Considering"
            case .applying: "Applying"
            case .inProgress: "In progress"
            case .submitted: "Submitted"
            case .materialsReceived: "Materials received"
            case .decision: "Decision"
            }
        }

        var isSubmitted: Bool { [.submitted, .materialsReceived, .decision].contains(self) }
    }

    enum Outcome: String, Codable, CaseIterable {
        case accepted, waitlisted, denied, deferred
        var label: String { rawValue.capitalized }
    }
}

// MARK: Check-ins, essays, recommenders

struct WeeklyCheckIn: Decodable, Identifiable {
    let id: String
    let weekOf: String
    var actions: [Action]
    var dismissed: Bool

    struct Action: Decodable {
        let text: String
        var done: Bool
    }
}

struct Essay: Decodable, Identifiable {
    let id: String
    let title: String
    let schoolId: String?
    let text: String
}

struct Recommender: Decodable, Identifiable {
    let id: String
    let name: String
    let status: String
}

// MARK: Snapshot

/// The AppSnapshot from lib/db/queries/snapshot.ts.
struct Snapshot: Decodable {
    let profile: Profile?
    var list: [ListEntry]
    var coursePlan: [Course]
    var activities: [Activity]
    var transcripts: [TranscriptFile]
    let essays: [Essay]
    let recommenders: [Recommender]
    var checkIns: [WeeklyCheckIn]
    let recentlyViewed: [String]
    let parentLinked: Bool
    var schools: [School]
    let viewerRole: Role
}

struct SnapshotResponse: Decodable {
    let viewer: Viewer
    let snapshot: Snapshot
}
