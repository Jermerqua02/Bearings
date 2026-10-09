import Foundation

/// Mirrors CounselorMessage in lib/counselor.ts.
struct CounselorMessage: Decodable, Identifiable {
    let id: String
    let author: Author
    let text: String
    let cards: [Card]?
    let createdAt: String

    enum Author: String, Decodable { case user, counselor }

    /// Only school cards render natively so far. The other kinds decode as
    /// `.other` and are skipped rather than failing the whole message.
    enum Card: Decodable {
        case school(schoolId: String, reason: String)
        case other

        private enum Key: String, CodingKey { case kind, schoolId, reason }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: Key.self)
            switch try c.decode(String.self, forKey: .kind) {
            case "school":
                self = .school(schoolId: try c.decode(String.self, forKey: .schoolId),
                               reason: try c.decode(String.self, forKey: .reason))
            default:
                self = .other
            }
        }
    }

    /// The optimistic copy of a student's message, shown before the
    /// server has it.
    static func local(_ text: String) -> CounselorMessage {
        CounselorMessage(id: UUID().uuidString, author: .user, text: text, cards: nil,
                         createdAt: ISO8601DateFormatter().string(from: .now))
    }
}

struct CounselorThread: Decodable, Identifiable {
    let id: String
    var title: String
    /// The school the conversation is about, when it started from one.
    var schoolId: String?
    var messages: [CounselorMessage]
}

struct ChatReply: Decodable {
    let message: CounselorMessage
    let title: String?
}

struct CreatedID: Decodable {
    let id: String
}
