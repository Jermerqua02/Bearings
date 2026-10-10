import Foundation

/*
  The first meeting's answers, and the questions that ask for them — a port
  of app/onboarding/page.tsx, so the app and the site ask the same things
  and write the same profile (POST /api/v1/onboarding → saveProfile).

  Numbers are kept as the text the student typed until they're sent: "3.6"
  half-typed as "3." is still an answer in progress, not a bad one.
*/

struct OnboardingAnswers {
    /// Only asked of an admin; everyone else is the role they signed up as.
    var role: Role?
    var firstName = ""
    var grade: Int?
    var gpaUnweighted = ""
    var gpaWeighted = ""
    var apCount = ""
    var honorsCount = ""
    var testChoice: TestChoice?
    var testScore = ""
    var majors: [String] = []
    var activities = ""
    var homeState: String?
    var regions: [String] = []
    var settings: [String] = []
    var budget: String?
    var fafsa = true
    var values: [String] = []
    var relationship: String?
    var priorities: [String] = []
    var worry = ""
    var involvement: String?

    enum TestChoice: String { case sat, act, notYet }

    mutating func toggle(_ key: WritableKeyPath<OnboardingAnswers, [String]>, _ id: String) {
        if self[keyPath: key].contains(id) { self[keyPath: key].removeAll { $0 == id } }
        else { self[keyPath: key].append(id) }
    }
}

/// What the student's in-progress meeting holds between openings, so
/// closing it to look around doesn't throw the answers away.
struct OnboardingDraft {
    var answers = OnboardingAnswers()
    var index = 0
}

// MARK: Choices

enum OnboardingChoices {
    static let undecided = "Undecided — still exploring"

    static let majors = [
        undecided, "Engineering", "Computer Science", "Biology / Pre-med", "Business", "Psychology",
        "English / Writing", "History / Politics", "Art / Design", "Performing Arts", "Nursing / Health",
        "Education", "Environmental Science",
    ]

    static let regions: [(id: String, label: String)] = [
        ("northeast", "Northeast"), ("mid-atlantic", "Mid-Atlantic"), ("south", "South"),
        ("midwest", "Midwest"), ("southwest", "Southwest"), ("west", "West"), ("northwest", "Northwest"),
    ]

    static let settings: [(id: String, label: String)] = [
        ("urban", "Urban"), ("suburban", "Suburban"), ("college-town", "College town"), ("rural", "Rural"),
    ]

    /// The label, and the most a year it means — budgetToNumber() on the web.
    static let budgets: [(label: String, max: Int?)] = [
        ("Under $15k / year", 15_000), ("$15k – $30k / year", 30_000), ("$30k – $50k / year", 50_000),
        ("$50k+ / year", 90_000), ("Honestly, not sure yet", nil),
    ]

    static let values: [(id: String, label: String)] = [
        ("research-access", "Research access"), ("co-op-internships", "Co-op / internship pipeline"),
        ("study-abroad", "Study abroad"), ("mental-health-support", "Mental-health support"),
        ("diversity", "Diversity"), ("lgbtq-friendly", "LGBTQ+ friendly"), ("greek-life", "Greek life"),
        ("d1-sports", "D1 sports"), ("religious-affiliation", "Religious community"),
        ("political-climate", "Political climate fit"),
    ]

    static let relationships = ["Mother", "Father", "Guardian", "Other family"]

    static let priorities = [
        "Affordability", "Academic strength", "Career outcomes", "Staying close to home",
        "My student's happiness", "Safety",
    ]

    static let involvement: [(id: String, label: String)] = [
        ("light-touch", "Light touch"), ("regular-check-ins", "Regular check-ins"), ("hands-on", "Hands-on"),
    ]
}

// MARK: Steps

enum OnboardingStep: Hashable {
    case role, name, grade, gpa, rigor, testing, majors, activities, homeState, regions, settings, budget, values
    case relationship, parentGrade, parentBudget, priorities, worry, involvement

    static func steps(for role: Role?, askRole: Bool) -> [OnboardingStep] {
        let start: [OnboardingStep] = askRole ? [.role] : []
        if role == .parent {
            return start + [.name, .relationship, .parentGrade, .parentBudget, .priorities, .worry, .involvement]
        }
        return start + [.name, .grade, .gpa, .rigor, .testing, .majors, .activities, .homeState, .regions,
                        .settings, .budget, .values]
    }
}

// MARK: Numbers

/// A number the student typed, or nil — parseNumber() on the web. Commas
/// are a spelling ("1,310"); anything out of range is a typo, not an answer.
func parseNumber(_ raw: String, _ range: ClosedRange<Double>) -> Double? {
    let cleaned = raw.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "")
    guard !cleaned.isEmpty, let n = Double(cleaned), n.isFinite, range.contains(n) else { return nil }
    return n
}

/// Something typed that isn't a usable number — the only case worth an error.
func isBadNumber(_ raw: String, _ range: ClosedRange<Double>) -> Bool {
    !raw.trimmingCharacters(in: .whitespaces).isEmpty && parseNumber(raw, range) == nil
}

enum OnboardingRange {
    static let gpa: ClosedRange<Double> = 0...5
    static let courses: ClosedRange<Double> = 0...30
    static let sat: ClosedRange<Double> = 400...1600
    static let act: ClosedRange<Double> = 1...36
}

// MARK: The body sent

extension OnboardingAnswers {
    /// The profile as POST /api/v1/onboarding reads it.
    func body(as role: Role) -> any Encodable {
        let budgetMax = OnboardingChoices.budgets.first { $0.label == budget }?.max
        if role == .parent {
            return ParentBody(role: "parent", firstName: firstName.trimmed,
                              relationship: relationship?.lowercased() ?? "parent",
                              studentGrade: grade ?? 11, budgetPerYear: budgetMax,
                              priorities: priorities, biggestWorry: worry.trimmed,
                              involvementLevel: involvement ?? "regular-check-ins")
        }
        let undecided = majors.isEmpty || majors.contains(OnboardingChoices.undecided)
        return StudentBody(
            role: "student",
            firstName: firstName.trimmed,
            gradeLevel: grade ?? 11,
            gpa: .init(unweighted: parseNumber(gpaUnweighted, OnboardingRange.gpa),
                       weighted: parseNumber(gpaWeighted, OnboardingRange.gpa)),
            rigor: .init(apCount: parseNumber(apCount, OnboardingRange.courses).map { Int($0) },
                         honorsCount: parseNumber(honorsCount, OnboardingRange.courses).map { Int($0) }),
            testScores: .init(sat: testChoice == .sat ? parseNumber(testScore, OnboardingRange.sat).map { Int($0) } : nil,
                              act: testChoice == .act ? parseNumber(testScore, OnboardingRange.act).map { Int($0) } : nil,
                              planningToTest: testChoice != .notYet),
            intendedMajors: undecided ? [] : majors.filter { $0 != OnboardingChoices.undecided },
            undecided: undecided,
            regions: regions,
            settings: settings,
            budget: .init(maxPerYear: budgetMax, willFileFafsa: fafsa),
            homeState: homeState,
            values: values
        )
    }

    private struct StudentBody: Encodable {
        let role: String
        let firstName: String
        let gradeLevel: Int
        let gpa: GPA
        let rigor: Rigor
        let testScores: Tests
        let intendedMajors: [String]
        let undecided: Bool
        let regions: [String]
        let settings: [String]
        let budget: Budget
        let homeState: String?
        let values: [String]

        struct GPA: Encodable { let unweighted: Double?; let weighted: Double? }
        struct Rigor: Encodable { let apCount: Int?; let honorsCount: Int? }
        struct Tests: Encodable { let sat: Int?; let act: Int?; let planningToTest: Bool }
        struct Budget: Encodable { let maxPerYear: Int?; let willFileFafsa: Bool }
    }

    private struct ParentBody: Encodable {
        let role: String
        let firstName: String
        let relationship: String
        let studentGrade: Int
        let budgetPerYear: Int?
        let priorities: [String]
        let biggestWorry: String
        let involvementLevel: String
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
