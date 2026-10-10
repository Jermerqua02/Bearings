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
    /// A reply as it's being written, by thread — what the counselor is
    /// doing and the words so far. Gone once the saved reply arrives.
    private(set) var inProgress: [String: Draft] = [:]

    struct Draft {
        enum Phase: String { case thinking, writing, cards }
        var phase: Phase = .thinking
        var text = ""
    }
    /// Schools named in cards that the snapshot didn't carry.
    private(set) var schools: [String: School] = [:]
    var error: String?
    /// For Pro: the Free sample's count, and the paywall when it's spent.
    weak var model: AppModel?

    private let api = APIClient.shared

    /// Free with no sample left: the paywall, not a message that will be refused.
    func sampleSpent() -> Bool {
        guard let model, !model.isPro, (model.sample?.chat ?? 0) <= 0 else { return false }
        model.showPaywall("That's the end of your free messages with the counselor. Pro lets you keep talking.")
        return true
    }

    func load() async {
        do {
            threads = try await api.get("/api/v1/counselor/threads")
            loaded = true
            await resolveSchools()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Open a conversation for the student's first message — no greeting
    /// first, since they've already said what they came to ask. Titled
    /// "About Reed College" when it starts from a school. Returns the id.
    func create(about school: School? = nil) async -> String? {
        struct Body: Encodable { let title: String?; let schoolId: String? }
        let title = school.map { "About \($0.shortName)" }
        do {
            let created: CreatedID = try await api.post("/api/v1/counselor/threads",
                                                        Body(title: title, schoolId: school?.id))
            threads.append(CounselorThread(id: created.id, title: title ?? "New conversation",
                                           schoolId: school?.id, messages: []))
            if let school { schools[school.id] = school }
            return created.id
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    func send(_ text: String, in threadId: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !sampleSpent() else { return }

        struct Context: Encodable { let schoolId: String }
        struct Body: Encodable { let message: String; let context: Context? }
        struct Phase: Decodable { let phase: String }
        struct Delta: Decodable { let delta: String }
        struct Done: Decodable { let title: String? }
        struct Failure: Decodable { let error: String }
        append(.local(trimmed), to: threadId)
        pending.insert(threadId)
        inProgress[threadId] = Draft()
        defer { pending.remove(threadId); inProgress[threadId] = nil }

        // Streamed, so the answer shows as it's written rather than after a
        // long "Thinking…". The `reply` event is the saved message and
        // replaces the draft; the title follows once the thread is named.
        var replied = false
        do {
            // The server knows the thread's school; sent too for a server
            // that predates threads remembering one.
            let body = Body(message: trimmed, context: thread(threadId)?.schoolId.map(Context.init))
            for try await event in api.events("/api/v1/counselor/threads/\(threadId)/messages/stream", body) {
                switch event.name {
                case "phase":
                    if let p = event.decode(Phase.self)?.phase, let phase = Draft.Phase(rawValue: p) {
                        inProgress[threadId]?.phase = phase
                    }
                case "text":
                    if let d = event.decode(Delta.self)?.delta { inProgress[threadId]?.text += d }
                case "reply":
                    if let r = event.decode(ChatReply.self) {
                        inProgress[threadId] = nil
                        append(r.message, to: threadId)
                        replied = true
                        model?.usedSample(.chat)
                    }
                case "done":
                    if let title = event.decode(Done.self)?.title, let i = index(threadId) { threads[i].title = title }
                case "error":
                    throw APIError(status: 500, message: event.decode(Failure.self)?.error
                                   ?? "The counselor couldn't answer just now. Try again in a moment.")
                default:
                    break
                }
            }
            if !replied { throw APIError.offline }
            // Clear "Thinking…" before fetching card schools — the answer is
            // already on screen.
            pending.remove(threadId)
            await resolveSchools()
        } catch {
            // Losing the connection after the answer arrived only costs the
            // title, which the next load picks up — not worth an alert.
            if replied { return }
            // Out of the Free sample: the paywall says so, not an alert.
            if model?.handlePro(error) == true { return }
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

    /// The school a conversation is about, if it started from one.
    func aboutSchool(_ threadId: String) -> School? {
        thread(threadId)?.schoolId.flatMap { schools[$0] }
    }

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
        } + threads.compactMap(\.schoolId)).subtracting(schools.keys)
        guard !wanted.isEmpty else { return }

        let ids = Array(wanted.prefix(50)).joined(separator: ",")
        if let found: [School] = try? await api.get("/api/v1/schools", query: [URLQueryItem(name: "ids", value: ids)]) {
            for s in found { schools[s.id] = s }
        }
    }
}
