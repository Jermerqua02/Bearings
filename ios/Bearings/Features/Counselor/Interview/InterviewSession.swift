import Foundation
import Observation

/// One sitting of interview practice, as a turn-based conversation:
///
///   choosing  → the student picks a school (or general practice)
///   asking    → the counselor says the question; its text follows her voice
///   answering → the student's turn: speak (transcribed on the phone) or type
///   thinking  → the answer is with the counselor
///   feedback  → her spoken reply, then what's working and what to work on
///
/// …then "Next question" goes back to asking, with the question she chose.
///
/// Only this sitting's turns are on screen. The server keeps every turn per
/// school; those are "Earlier practice", reachable from the start screen.
@Observable
final class InterviewSession {
    enum Phase: Equatable { case choosing, asking, answering, thinking, feedback }

    /// A question asked in this sitting, and — once given — its answer
    /// and her feedback.
    struct Exchange: Identifiable {
        let id = UUID()
        let question: String
        var answer: String?
        var feedback: InterviewFeedback?
        /// Her cards wait until she's said her reply, so they read as what
        /// she said rather than arriving ahead of her.
        var cardsShown = false
    }

    private(set) var phase: Phase = .choosing
    /// "" is general practice — the only kind the screen offers now. The
    /// server still keeps practice per school, for when it comes back.
    private(set) var schoolId = ""
    private(set) var state: InterviewState?
    private(set) var exchanges: [Exchange] = []
    /// The answer being written or spoken for the current question.
    var answer = ""
    /// The answer that's with the counselor, shown while she thinks.
    private(set) var sent: String?
    var error: String?
    private(set) var loading = false

    let voice = CounselorVoice()
    /// For Pro: the Free sample's count, and the paywall when it's spent.
    weak var model: AppModel?

    /// Free with no practice left: the paywall rather than a refused answer.
    private func sampleSpent() -> Bool {
        guard let model, !model.isPro, (model.sample?.interview ?? 0) <= 0 else { return false }
        model.showPaywall("Interview practice is part of Lumni Pro.")
        return true
    }
    let ears = SpeechRecognizer()

    private let api = APIClient.shared
    /// Bumped when a sitting ends or the school changes, so an answer or a
    /// spoken line still in flight can't land on the new one.
    private var sitting = 0
    /// The student tapped stop and the last words are still arriving, so
    /// recognition ending isn't "ended on its own".
    private var stopping = false

    var current: Exchange? { exchanges.last }
    var schoolName: String? { state?.schools.first { $0.id == schoolId }?.name }
    var earlier: [InterviewTurn] { state?.turns ?? [] }

    // MARK: Loading

    /// Questions, schools, and the chosen school's saved practice.
    func load() async {
        let wanted = schoolId
        loading = true
        defer { loading = false }
        do {
            let query = wanted.isEmpty ? [] : [URLQueryItem(name: "schoolId", value: wanted)]
            let s: InterviewState = try await api.get("/api/v1/interviews", query: query)
            // The student may have picked another school while this loaded.
            guard wanted == schoolId else { return }
            state = s
            error = nil
        } catch {
            guard wanted == schoolId else { return }
            self.error = error.localizedDescription
        }
    }


    // MARK: The turn

    func start() async {
        guard phase == .choosing, !sampleSpent() else { return }
        sitting += 1
        exchanges = []
        error = nil
        voice.prepareAcknowledgments()
        await ask(firstQuestion())
    }

    /// The counselor's turn: say the question, then hand over.
    func ask(_ question: String) async {
        let mine = sitting
        exchanges.append(Exchange(question: question))
        answer = ""
        sent = nil
        ears.cancel()
        phase = .asking
        await voice.say(question)
        if mine == sitting, phase == .asking { phase = .answering }
    }

    /// Say the current question again.
    func replayQuestion() async {
        guard let q = current?.question, phase == .answering || phase == .asking else { return }
        let mine = sitting
        if ears.recording { _ = await ears.stop() }
        phase = .asking
        await voice.say(q)
        if mine == sitting, phase == .asking { phase = .answering }
    }

    /// Skip the rest of the question's reading and answer now.
    func answerNow() {
        voice.stop()
        if phase == .asking { phase = .answering }
    }

    func startRecording() async {
        voice.stop()
        if phase == .asking { phase = .answering }
        guard phase == .answering else { return }
        error = nil
        guard await ears.prepare() else { return }
        do {
            try ears.start()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Tapping stop means "that's my answer": it goes straight to her.
    func stopRecording() async {
        guard !stopping else { return }
        stopping = true
        let heard = await ears.stop()
        stopping = false
        adopt(heard)
        if !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { await submit() }
    }

    /// Recognition ended on its own (a long pause, an interruption). Not
    /// sent: they may not have finished, so it waits in the box to edit.
    func recordingEnded() {
        guard !stopping else { return }
        adopt(ears.transcript)
    }

    private func adopt(_ heard: String) {
        let text = heard.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty {
            answer = text
        } else if answer.isEmpty, phase == .answering {
            error = "I didn't catch anything that time. Try again, or type your answer."
        }
    }

    /// Send the answer. On failure the answer stays put and the turn is
    /// still theirs, with the reason shown.
    func submit() async {
        if ears.recording {
            stopping = true
            adopt(await ears.stop())
            stopping = false
        }
        let text = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        guard phase == .answering, !text.isEmpty, let question = current?.question else { return }

        struct Exchanged: Encodable { let question: String; let answer: String }
        struct Body: Encodable {
            let schoolId: String?
            let question: String
            let answer: String
            let history: [Exchanged]
        }
        let history = exchanges.dropLast().compactMap { e in e.answer.map { Exchanged(question: e.question, answer: $0) } }

        let mine = sitting
        error = nil
        sent = text
        phase = .thinking
        voice.acknowledge()
        do {
            let fb: InterviewFeedback = try await api.post("/api/v1/interviews", Body(
                schoolId: schoolId.isEmpty ? nil : schoolId, question: question, answer: text,
                history: Array(history.suffix(6))))
            guard mine == sitting else { return }
            exchanges[exchanges.count - 1].answer = text
            exchanges[exchanges.count - 1].feedback = fb
            model?.usedSample(.interview)
            answer = ""
            sent = nil
            phase = .feedback
            // Her reply first, then the next question's voice, fetched while
            // she gives this one.
            voice.prefetch(fb.followUp)
            voice.prefetch(nextQuestion)
            let id = exchanges[exchanges.count - 1].id
            await voice.say(fb.followUp)
            // Said, stopped, or skipped past: either way, now the cards.
            if mine == sitting, let i = exchanges.firstIndex(where: { $0.id == id }) {
                exchanges[i].cardsShown = true
            }
        } catch {
            guard mine == sitting else { return }
            sent = nil
            phase = .answering
            // Out of the Free sample: the paywall; their answer stays put.
            if model?.handlePro(error) == true { return }
            self.error = error.localizedDescription
        }
    }

    /// Replay or stop her reply to the last answer.
    func toggleReply() async {
        if voice.speaking { voice.stop(); return }
        guard phase == .feedback, let reply = current?.feedback?.followUp else { return }
        await voice.say(reply)
    }

    func next() async {
        guard phase == .feedback else { return }
        await ask(nextQuestion)
    }

    /// End the sitting. What was answered is already saved on the server,
    /// so it reloads into Earlier practice.
    func end() {
        sitting += 1
        voice.reset()
        ears.cancel()
        exchanges = []
        answer = ""
        sent = nil
        error = nil
        let wasPracticing = phase != .choosing
        phase = .choosing
        if wasPracticing { Task { await load() } }
    }

    // MARK: Choosing questions

    /// Hers, if she gave one; otherwise a common question not asked yet.
    private var nextQuestion: String {
        if let q = current?.feedback?.nextQuestion?.trimmingCharacters(in: .whitespacesAndNewlines), !q.isEmpty {
            return q
        }
        return unasked(avoiding: exchanges.map(\.question))
    }

    /// Open with a common question, avoiding the ones answered lately.
    private func firstQuestion() -> String {
        unasked(avoiding: earlier.suffix(6).map(\.question))
    }

    private func unasked(avoiding asked: [String]) -> String {
        let pool = state?.questions ?? []
        let seen = Set(asked.map { $0.lowercased() })
        let fresh = pool.filter { !seen.contains($0.lowercased()) }
        return (fresh.isEmpty ? pool : fresh).randomElement() ?? "Tell me about yourself."
    }
}
