import AVFoundation
import Observation

/// The counselor's voice in interview practice: says a line aloud while
/// revealing its text in step, so the words appear as she speaks them.
///
/// Three ways to say a line, best first:
///   hosted — /api/tts, Gemini's "Kore", the same voice as Read aloud on
///            the web. Sounds like a person; costs a round trip.
///   device — AVSpeechSynthesizer, when the hosted voice is slow, rate
///            limited, or unavailable. The interview never waits on audio.
///   silent — muted: the text types itself out briefly, no sound.
///
/// A hosted line is voiced in pieces of a sentence or two, all requested at
/// once and played in order: the first piece is ready in about two seconds,
/// where the whole reply took six or more, and the rest arrive while it
/// plays. If a later piece fails, the rest of the line is shown rather than
/// said in a second, robotic voice.
///
/// Gemini returns no word timings, so the hosted reveal is paced across each
/// clip's duration, each word weighted by its length plus a pause after
/// punctuation, kept a beat ahead of the voice. The device voice reports
/// each word as it starts, so that reveal is exact.
@Observable
final class CounselorVoice {
    /// The line being said, in full. The view lays out the whole thing and
    /// shows only the revealed part, so the bubble doesn't grow as it types.
    private(set) var text = ""
    /// How much of `text` is showing, in UTF-16 units — always on a word
    /// boundary, so it never splits a character.
    private(set) var revealed = 0
    /// True from the moment a line is asked for until it's done or stopped.
    private(set) var speaking = false
    /// Waiting on the hosted voice, before anything is audible.
    private(set) var preparing = false

    /// Text only. Set from the view's @AppStorage.
    var muted = false {
        didSet { if muted && !oldValue { stop() } }
    }
    /// Reduce Motion: show the whole line at once (the voice still plays).
    var reduceMotion = false

    var shownText: String {
        revealed >= text.utf16.count ? text : (String(text.utf16.prefix(revealed)) ?? text)
    }
    var hiddenText: String {
        revealed >= text.utf16.count ? "" : (String(text.utf16.dropFirst(revealed)) ?? "")
    }

    private let api = APIClient.shared
    private var player: AVAudioPlayer?
    /// The acknowledgment playing while she reads an answer. Separate from
    /// `player`, so her reply waits for it to finish instead of cutting it off.
    private var ackPlayer: AVAudioPlayer?
    /// Acknowledgment clips, fetched when a sitting starts.
    private var acks: [String: Data] = [:]
    private let synthesizer = AVSpeechSynthesizer()
    private let deviceEvents = DeviceSpeechEvents()
    /// The utterance being spoken, so a late callback from one that was
    /// cancelled can't end or reveal the next.
    private var utterance: ObjectIdentifier?
    private var deviceDone = false
    /// Bumped by every say() and stop(), so a line that was cut off can't
    /// finish revealing over the next one.
    private var generation = 0
    /// Clips fetched ahead of need — the next question, while the student
    /// reads the feedback on the last one.
    private var prefetched: [String: Task<Data?, Never>] = [:]
    /// Hosted lines that failed in a row. The server already falls back to
    /// a second Gemini model, so one miss is usually a blip; after two in a
    /// row (rate limit, outage, offline) the rest of the sitting uses the
    /// device voice rather than waiting on requests that will likely fail.
    private var hostedFailures = 0
    private var hostedOff: Bool { hostedFailures >= 2 }

    init() {
        synthesizer.delegate = deviceEvents
        deviceEvents.onWord = { [weak self] id, end in
            Task { @MainActor in
                guard let self, id == self.utterance else { return }
                self.deviceReveal(to: end)
            }
        }
        deviceEvents.onDone = { [weak self] id in
            Task { @MainActor in
                guard let self, id == self.utterance else { return }
                self.deviceDone = true
            }
        }
    }

    // MARK: Saying a line

    /// Say `line` and return when it's finished — or stopped.
    func say(_ line: String) async {
        halt()
        generation += 1
        let mine = generation
        text = line
        revealed = 0
        speaking = true

        if muted {
            await finishAcknowledgment()
            if mine == generation { await typeOut(mine) }
        } else if hostedOff {
            await finishAcknowledgment()
            if mine == generation { await speakOnDevice(mine) }
        } else {
            await sayHosted(mine)
        }

        if mine == generation {
            revealed = text.utf16.count
            speaking = false
            preparing = false
        }
    }

    /// Stop talking — the acknowledgment too — and show the whole line.
    func stop() {
        ackPlayer?.stop()
        ackPlayer = nil
        halt()
    }

    /// Stop the line being said, leaving any acknowledgment to finish.
    private func halt() {
        generation += 1
        player?.stop()
        player = nil
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        utterance = nil
        revealed = text.utf16.count
        speaking = false
        preparing = false
    }

    /// Start fetching a line's audio now, to say it later without the wait.
    func prefetch(_ line: String) {
        guard !muted, !hostedOff else { return }
        for piece in Self.pieces(of: line) where prefetched[piece.text] == nil {
            prefetched[piece.text] = fetchTask(piece.text)
        }
    }

    /// Forget everything — a new sitting starts clean.
    func reset() {
        stop()
        text = ""
        revealed = 0
        prefetched.values.forEach { $0.cancel() }
        prefetched = [:]
    }

    // MARK: Acknowledging

    /// What she says the moment an answer is sent, so the wait while she
    /// reads it isn't silence — the way an interviewer says "mm, okay".
    static let acknowledgments = [
        "Okay, give me a second with that.",
        "Mm, okay. Let me think about that.",
        "Got it. One moment.",
        "Alright, let me sit with that for a second.",
    ]

    /// Fetch the acknowledgments ahead of time; they only ever play from here.
    func prepareAcknowledgments() {
        guard !muted, !hostedOff else { return }
        for line in Self.acknowledgments where acks[line] == nil {
            let task = fetchTask(line)
            Task { [weak self] in
                if let data = await task.value { self?.acks[line] = data }
            }
        }
    }

    /// Play one, if any is ready. Never waits and never uses the device
    /// voice: a late or robotic "one moment" is worse than none.
    func acknowledge() {
        guard !muted, let data = Self.acknowledgments.shuffled().lazy.compactMap({ self.acks[$0] }).first,
              let ack = try? AVAudioPlayer(data: data) else { return }
        InterviewAudio.activate()
        ackPlayer?.stop()
        ackPlayer = ack
        ack.play()
    }

    /// Her reply starts after the acknowledgment, not on top of it.
    private func finishAcknowledgment() async {
        while let ack = ackPlayer, ack.isPlaying {
            try? await Task.sleep(for: .milliseconds(50))
        }
        ackPlayer = nil
    }

    // MARK: Hosted

    private func fetchTask(_ line: String) -> Task<Data?, Never> {
        struct Body: Encodable { let text: String }
        let api = api
        return Task {
            // A clip that takes longer than this is worse than the phone's
            // own voice now.
            try? await api.postData("/api/tts", Body(text: line), timeout: 12)
        }
    }

    private func sayHosted(_ mine: Int) async {
        let pieces = Self.pieces(of: text)
        // Every piece is asked for now; each plays as soon as it's its turn.
        let tasks = pieces.map { prefetched.removeValue(forKey: $0.text) ?? fetchTask($0.text) }
        preparing = true
        await finishAcknowledgment()

        for (i, piece) in pieces.enumerated() {
            let data = await tasks[i].value
            guard mine == generation else { break }
            if i == 0 { preparing = false }
            guard let data else {
                if !tasks[i].isCancelled { hostedFailures += 1 }
                // Nothing said yet: the phone's voice says it all. Partway
                // through, the rest is shown rather than said in a second voice.
                if i == 0 { await speakOnDevice(mine) }
                break
            }
            hostedFailures = 0
            if !(await play(data, from: piece.start, to: piece.end, generation: mine)) {
                if i == 0, mine == generation { await speakOnDevice(mine) }
                break
            }
        }
        // Whatever is left unasked-for (stopped early) isn't needed.
        tasks.forEach { $0.cancel() }
    }

    /// Play one clip, revealing the words of `text` between `from` and `to`
    /// (UTF-16) in step with it. False if it wouldn't play.
    private func play(_ data: Data, from: Int, to: Int, generation mine: Int) async -> Bool {
        guard let player = try? AVAudioPlayer(data: data), player.duration > 0 else { return false }
        InterviewAudio.activate()
        self.player = player
        player.prepareToPlay()
        guard player.play() else { self.player = nil; return false }

        let words = Self.words(in: text).filter { $0.end > from && $0.end <= to }
        let total = words.reduce(0) { $0 + $1.weight }
        // Gemini leaves a little air at each end; pace across the middle,
        // and stay a quarter-second ahead so the eye never waits on the ear.
        let span = max(0.5, player.duration * 0.94)
        while mine == generation, player.isPlaying {
            if reduceMotion {
                revealed = text.utf16.count
            } else if total > 0 {
                let at = (player.currentTime + 0.25) / span * total
                var before = 0.0
                var shown = revealed
                for word in words {
                    if before > at { break }
                    shown = word.end
                    before += word.weight
                }
                revealed = max(revealed, shown)
            }
            try? await Task.sleep(for: .milliseconds(40))
        }
        if mine == generation {
            self.player = nil
            revealed = max(revealed, to)
        }
        return true
    }

    /// A line cut where it can be voiced in parts: after a sentence's end
    /// punctuation and the space that follows. Pieces under about 40
    /// characters join the next, so a clip is never a word or two — those
    /// sound clipped, and Gemini sometimes refuses one outright.
    static func pieces(of line: String) -> [(text: String, start: Int, end: Int)] {
        var cuts: [Int] = []
        var offset = 0
        var previous: Character = " "
        for ch in line {
            if ch.isWhitespace, ".!?".contains(previous) { cuts.append(offset + ch.utf16.count) }
            previous = ch
            offset += ch.utf16.count
        }
        let total = line.utf16.count
        var pieces: [(text: String, start: Int, end: Int)] = []
        var start = 0
        for cut in cuts + [total] where cut > start {
            if cut < total, cut - start < 40 { continue }
            pieces.append((String(line.utf16[line.utf16.index(line.utf16.startIndex, offsetBy: start)..<line.utf16.index(line.utf16.startIndex, offsetBy: cut)]) ?? "", start, cut))
            start = cut
        }
        // A short last sentence rides with the one before it.
        if pieces.count > 1, let last = pieces.last, last.end - last.start < 40 {
            pieces.removeLast()
            let prev = pieces.removeLast()
            let s = line.utf16.index(line.utf16.startIndex, offsetBy: prev.start)
            pieces.append((String(line.utf16[s...]) ?? "", prev.start, total))
        }
        return pieces.map { (text: $0.text.trimmingCharacters(in: .whitespacesAndNewlines), start: $0.start, end: $0.end) }
            .filter { !$0.text.isEmpty }
    }

    // MARK: Device

    private func speakOnDevice(_ mine: Int) async {
        InterviewAudio.activate()
        let line = AVSpeechUtterance(string: text)
        line.voice = Self.deviceVoice
        line.prefersAssistiveTechnologySettings = true
        utterance = ObjectIdentifier(line)
        deviceDone = false
        if reduceMotion { revealed = text.utf16.count }
        synthesizer.speak(line)

        // Polled rather than awaited on a continuation: stop() can land
        // before the synthesizer has started, and a continuation that's
        // never resumed would hang the turn. The deadline is a backstop for
        // a delegate callback that never comes.
        let deadline = Date().addingTimeInterval(Double(text.count) * 0.12 + 8)
        while mine == generation, !deviceDone, Date() < deadline {
            try? await Task.sleep(for: .milliseconds(60))
        }
        if mine == generation, synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
    }

    private func deviceReveal(to end: Int) {
        guard speaking, player == nil, !reduceMotion else { return }
        // The synthesizer reports the word it's starting; snap to the end
        // of that whitespace-delimited token so its punctuation comes too.
        let next = Self.words(in: text).first { $0.end >= end }?.end ?? text.utf16.count
        revealed = max(revealed, next)
    }

    /// The best English voice on the phone — an enhanced or premium one if
    /// the student has downloaded it, a woman's to match Kore if there is one.
    private static let deviceVoice: AVSpeechSynthesisVoice? = {
        func score(_ v: AVSpeechSynthesisVoice) -> Int {
            (v.quality == .premium ? 4 : v.quality == .enhanced ? 2 : 0)
                + (v.gender == .female ? 1 : 0)
                + (v.language == "en-US" ? 1 : 0)
        }
        let english = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("en") }
        return english.max { score($0) < score($1) } ?? AVSpeechSynthesisVoice(language: "en-US")
    }()

    // MARK: Silent

    /// Muted: a short typing reveal, never more than about a second and a half.
    private func typeOut(_ mine: Int) async {
        let words = Self.words(in: text)
        guard !reduceMotion, !words.isEmpty else { revealed = text.utf16.count; return }
        let step = min(0.06, 1.5 / Double(words.count))
        for word in words {
            guard mine == generation else { return }
            revealed = word.end
            try? await Task.sleep(for: .seconds(step))
        }
    }

    // MARK: Words

    /// Whitespace-delimited tokens: where each ends (UTF-16), and roughly
    /// how long it takes to say — its length, plus a pause after punctuation.
    static func words(in text: String) -> [(end: Int, weight: Double)] {
        var out: [(end: Int, weight: Double)] = []
        var offset = 0
        var length = 0
        var last: Character = " "
        func close() {
            guard length > 0 else { return }
            let pause: Double = ".!?".contains(last) ? 5 : ",;:—–".contains(last) ? 2.5 : 0
            out.append((offset, Double(length) + 1.5 + pause))
            length = 0
        }
        for ch in text {
            if ch.isWhitespace { close() } else { length += 1; last = ch }
            offset += ch.utf16.count
        }
        close()
        return out
    }
}

/// AVSpeechSynthesizer's delegate. Its callbacks arrive on whatever thread
/// the synthesizer likes, so this stays off the main actor and only
/// forwards; CounselorVoice hops back to the main actor itself.
nonisolated private final class DeviceSpeechEvents: NSObject, AVSpeechSynthesizerDelegate, @unchecked Sendable {
    var onWord: (@Sendable (ObjectIdentifier, Int) -> Void)?
    var onDone: (@Sendable (ObjectIdentifier) -> Void)?

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, willSpeakRangeOfSpeechString characterRange: NSRange,
                           utterance: AVSpeechUtterance) {
        onWord?(ObjectIdentifier(utterance), characterRange.location + characterRange.length)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        onDone?(ObjectIdentifier(utterance))
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        onDone?(ObjectIdentifier(utterance))
    }
}

/// The one audio session interview practice uses: play and record, out of
/// the speaker rather than the earpiece, so the counselor can talk and the
/// student can answer without anything being reconfigured mid-turn.
enum InterviewAudio {
    static func activate() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
        try? session.setActive(true)
    }

    /// Let music the student paused come back.
    static func deactivate() {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
