import Foundation

/// CoursePlanEntry in lib/types.ts.
struct Course: Codable, Identifiable, Hashable {
    var id: String
    var year: Int
    var subject: Subject
    var name: String
    var level: Level
    var status: Status
    var grade: String?
    var term: String?
    var credits: Double?

    enum Subject: String, Codable, CaseIterable {
        case english = "English", math = "Math", science = "Science"
        case socialStudies = "Social Studies", language = "Language", arts = "Arts", elective = "Elective"
    }

    enum Level: String, Codable, CaseIterable {
        case regular, honors, ap, ib
        var label: String {
            switch self {
            case .regular: "Regular"
            case .honors: "Honors"
            case .ap: "AP"
            case .ib: "IB"
            }
        }
    }

    enum Status: String, Codable, CaseIterable {
        case completed, inProgress = "in-progress", planned
        var label: String {
            switch self {
            case .completed: "Completed"
            case .inProgress: "Taking now"
            case .planned: "Planned"
            }
        }
    }
}

/// Activity in lib/types.ts.
struct Activity: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var role: String
    var hoursPerWeek: Double
    var weeksPerYear: Double
    var description: String
    var yearsInvolved: [Int]
    var leadership: Bool
    var position: Int?
}

struct ReportedGpa: Codable, Hashable {
    let unweighted: Double?
    let weighted: Double?
    let credits: Double?
}

/// TranscriptFile in lib/types.ts — metadata only; the bytes stay on the server.
struct TranscriptFile: Codable, Identifiable, Hashable {
    let id: String
    let filename: String
    let contentType: String
    let sizeBytes: Double
    let uploadedAt: String
    var courseCount: Int?
    var reportedGpa: ReportedGpa?
}

/// ExtractedCourse — a claim about what a document says, not yet a course.
struct ExtractedCourse: Codable, Hashable {
    let year: Int
    let subject: Course.Subject
    let name: String
    let level: Course.Level
    let grade: String?
    let term: String?
    let credits: Double?
}

/// readTranscriptAction's ReadResult.
struct TranscriptReading: Decodable {
    let ok: Bool
    let error: String?
    let courses: [ExtractedCourse]?
    let notes: [String]?
    let looksLikeTranscript: Bool?
    let reportedGpa: ReportedGpa?
}

/// addExtractedCoursesAction's result.
struct AddCoursesResult: Decodable {
    let ok: Bool
    let error: String?
    let added: [Course]?
    let skipped: Int?
    let rigor: Rigor?

    struct Rigor: Decodable { let apCount: Int; let ibCount: Int; let honorsCount: Int }
}

/// GET /api/v1/planner — the arithmetic, done by lib/coursework.
struct PlannerSummary: Decodable {
    let computed: Gpa
    let reported: ReportedGpa?
    let rigor: Rigor
    let gradeOptions: [String]
    let limits: Limits

    struct Gpa: Decodable { let unweighted: Double?; let weighted: Double?; let graded: Int }
    struct Rigor: Decodable { let advanced: Int; let ahead: Int }
    struct Limits: Decodable { let activitySlots: Int; let descriptionChars: Int }
}

struct Opportunity: Decodable, Identifiable {
    let id: String
    let name: String
    let org: String
    let type: String
    let cost: String
    let selective: Bool
    let location: String
    let description: String
}
