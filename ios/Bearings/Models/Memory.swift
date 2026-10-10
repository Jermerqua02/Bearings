import Foundation

/// One topic the counselor files what it learns under (lib/memory.ts).
struct MemoryTopic: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
    let description: String

    /// An icon per topic; anything new falls back to a note.
    var icon: String {
        switch id {
        case "academics": "graduationcap"
        case "activities": "trophy"
        case "goals": "lightbulb"
        case "preferences": "building.columns"
        case "circumstances": "house"
        case "story": "book"
        // A parent's topics.
        case "student": "person"
        case "money": "dollarsign.circle"
        case "family": "house"
        case "hopes": "heart"
        case "wants": "building.columns"
        default: "note.text"
        }
    }
}

/// Something the counselor remembers about the student.
struct MemoryFact: Codable, Identifiable, Hashable {
    let id: String
    var category: String
    var fact: String
    let source: String
    let createdAt: String
}

struct MemoryResponse: Decodable {
    let categories: [MemoryTopic]
    let facts: [MemoryFact]
}
