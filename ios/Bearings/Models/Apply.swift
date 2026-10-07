import Foundation

/// One tracker card from GET /api/v1/applications — computed by
/// lib/requirements and lib/schools on the server.
struct ApplicationCard: Decodable, Identifiable {
    var id: String { schoolId }
    let schoolId: String
    let prompt: PlanPrompt
    let plans: [PlanChoice]
    let requirements: [RequirementLine]
    let emptyReason: String
    let fee: Fee
    let routes: [ApplyRoute]
    let attribution: String?

    /// planPrompt(): whether choosing a round changes anything here.
    enum PlanPrompt: Decodable {
        case choose(dated: [ApplicationPlan], others: [ApplicationPlan])
        case single(plan: ApplicationPlan, due: String)
        case unknown

        private enum Key: String, CodingKey { case mode, dated, others, plan, due }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: Key.self)
            switch try c.decode(String.self, forKey: .mode) {
            case "choose":
                self = .choose(dated: try c.decode([ApplicationPlan].self, forKey: .dated),
                               others: try c.decode([ApplicationPlan].self, forKey: .others))
            case "single":
                self = .single(plan: try c.decode(ApplicationPlan.self, forKey: .plan),
                               due: try c.decode(String.self, forKey: .due))
            default:
                self = .unknown
            }
        }
    }

    struct PlanChoice: Decodable, Identifiable {
        let id: ApplicationPlan
        let label: String
        let due: String?
        let why: String
    }

    struct RequirementLine: Decodable, Identifiable {
        var id: String { key }
        let key: String
        let label: String
        let status: String
        let detail: String?
        let done: Bool?
        let mandatory: Bool
    }

    struct Fee: Decodable {
        let text: String
        let known: Bool
        let asOf: String?
        let mayHaveDropped: Bool?
    }

    struct ApplyRoute: Decodable, Identifiable {
        var id: String { href + label }
        let href: String
        let label: String
        let shared: Bool
    }
}

struct ApplicationsResponse: Decodable {
    let cards: [ApplicationCard]
}

// MARK: Interviews

struct InterviewFeedback: Decodable {
    let strengths: [String]
    let toWorkOn: [String]
    let followUp: String
}

struct InterviewTurn: Decodable, Identifiable {
    var id = UUID()
    let question: String
    let answer: String
    let feedback: InterviewFeedback

    private enum CodingKeys: String, CodingKey { case question, answer, feedback }

    init(question: String, answer: String, feedback: InterviewFeedback) {
        self.question = question
        self.answer = answer
        self.feedback = feedback
    }
}

struct InterviewState: Decodable {
    let questions: [String]
    let schools: [Named]
    let turns: [InterviewTurn]

    struct Named: Decodable, Identifiable, Hashable { let id: String; let name: String }
}
