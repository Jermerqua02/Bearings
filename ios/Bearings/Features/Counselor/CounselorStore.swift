import Foundation
import Observation

/// Conversations with the counselor — the native side of
/// lib/actions/counselor.ts. Kept apart from AppModel because threads
/// aren't in the snapshot and only students ever load them.
@Observable
final class CounselorStore {
    private(set) var threads: [CounselorThread] = []
    private(set) var loaded = false
    /// Thread ids waiting on a reply, so the UI can show it's thinking.
    private(set) var pending: Set<String> = []
    /// Schools named in cards that the snapshot didn't carry.
    private(set) var schools: [String: School] = [:]
    /// The school a conversation is about, when it was opened from one —
    /// sent as context with every message, as the web does.
    private(set) var contextSchool: [String: String] = [:]
    var error: String?

    private let api = APIClient.shared

    func load() async {
        do {
            threads = try await api.get("/api/v1/counselor/threads")
            loaded = true
            await resolveSchools()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Start a thread and let the counselor open it. Returns the new id.
    func start(about school: School? = nil) async -> String? {
        struct Body: Encodable { let title: String? }
        let title = school.map { "About \($0.shortName)" }
        do {
            let created: CreatedID = try await api.post("/api/v1/counselor/threads", Body(title: title))
            threads.append(CounselorThread(id: created.id, title: title ?? "New conversation", messages: []))
            if let school { contextSchool[created.id] = school.id; schools[school.id] = school }
            pending.insert(created.id)
            defer { pending.remove(created.id) }
            let greeting: CounselorMessage = try await api.post("/api/v1/counselor/threads/\(created.id)/greet")
            append(greeting, to: created.id)
            return created.id
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    func send(_ text: String, in threadId: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        struct Context: Encodable { let schoolId: String }
        struct Body: Encodable { let message: String; let context: Context? }
        append(.local(trimmed), to: threadId)
        pending.insert(threadId)
        defer { pending.remove(threadId) }

        do {
            let reply: ChatReply = try await api.post("/api/v1/counselor/threads/\(threadId)/messages",
                                                      Body(message: trimmed,
                                                           context: contextSchool[threadId].map(Context.init)))
            append(reply.message, to: threadId)
            if let title = reply.title, let i = index(threadId) { threads[i].title = title }
            await resolveSchools()
        } catch {
            // The student's message stays on screen — the server persists it
            // before calling the model, so it's in the thread either way.
            self.error = error.localizedDescription
        }
    }

    func delete(_ threadId: String) async {
        guard let i = index(threadId) else { return }
        let removed = threads.remove(at: i)
        do {
            try await api.perform("DELETE", "/api/v1/counselor/threads/\(threadId)")
        } catch {
            threads.insert(removed, at: i)
            self.error = error.localizedDescription
        }
    }

    func thread(_ id: String) -> CounselorThread? {
        threads.first { $0.id == id }
    }

    func school(_ id: String) -> School? { schools[id] }

    // MARK: Private

    private func index(_ id: String) -> Int? { threads.firstIndex { $0.id == id } }

    private func append(_ message: CounselorMessage, to threadId: String) {
        guard let i = index(threadId) else { return }
        threads[i].messages.append(message)
    }

    /// Fetch any school a card names that we don't have yet. A card that
    /// can't be resolved still shows its reason, just without a name.
    private func resolveSchools() async {
        let wanted = Set(threads.flatMap(\.messages).flatMap { $0.cards ?? [] }.compactMap { card -> String? in
            if case .school(let id, _) = card { return id }
            return nil
        }).subtracting(schools.keys)
        guard !wanted.isEmpty else { return }

        let ids = Array(wanted.prefix(50)).joined(separator: ",")
        if let found: [School] = try? await api.get("/api/v1/schools", query: [URLQueryItem(name: "ids", value: ids)]) {
            for s in found { schools[s.id] = s }
        }
    }
}
