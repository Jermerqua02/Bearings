import AVFoundation
import Observation
import Speech

/// The student's spoken answer, as text — transcribed on the phone.
///
/// On-device only. If this phone can't recognise speech locally, Apple's
/// server recognition is NOT used instead: the promise is that a recording
/// never leaves the device, so the fallback is typing, and the screen says
/// so. Only the transcript the student chooses to send goes anywhere.
@Observable
final class SpeechRecognizer {
    /// What's said so far — live while recording, final once stopped.
    private(set) var transcript = ""
    private(set) var recording = false
    /// Waiting on the last words after Stop.
    private(set) var finishing = false
    /// Microphone loudness, 0…1, for the pulse around the record button.
    private(set) var level: Double = 0
    /// Why speaking isn't available, written for the student. Nil means
    /// it is (or hasn't been tried yet).
    private(set) var unavailable: String?

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var engine: AVAudioEngine?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    /// Bumped per recording, so a late result from the last one is ignored.
    private var take = 0
    private var gotFinal = false

    /// Ask for the microphone and speech recognition, once. False — with
    /// `unavailable` set — if either is refused or this phone can't
    /// transcribe on the device.
    func prepare() async -> Bool {
        guard let recognizer, recognizer.supportsOnDeviceRecognition else {
            unavailable = "This iPhone can't turn speech into text on the device, and I won't send your voice anywhere else to do it. Type your answer instead."
            return false
        }
        switch await Self.speechAuthorization() {
        case .authorized: break
        case .notDetermined, .denied, .restricted:
            unavailable = "Speech recognition is off for Bearings. Turn it on in Settings › Bearings to answer out loud — or type your answer."
            return false
        @unknown default:
            unavailable = "Speech recognition isn't available. Type your answer instead."
            return false
        }
        guard await AVAudioApplication.requestRecordPermission() else {
            unavailable = "Bearings can't use the microphone. Allow it in Settings › Bearings to answer out loud — or type your answer."
            return false
        }
        guard recognizer.isAvailable else {
            unavailable = "Speech recognition isn't available right now. Type your answer instead."
            return false
        }
        unavailable = nil
        return true
    }

    /// Start listening. Throws a message the student can read.
    func start() throws {
        cancel()
        guard let recognizer else { throw RecognizerError("Speech recognition isn't available. Type your answer instead.") }

        InterviewAudio.activate()
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw RecognizerError("I can't hear a microphone on this device. Type your answer instead.")
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = true
        request.addsPunctuation = true
        request.taskHint = .dictation

        take += 1
        let mine = take
        transcript = ""
        gotFinal = false

        Self.installTap(on: input, format: format, feeding: request) { [weak self] level in
            Task { @MainActor in
                guard let self, self.take == mine, self.recording else { return }
                // Smoothed, so the ring breathes rather than flickers.
                self.level = self.level * 0.6 + level * 0.4
            }
        }
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            throw RecognizerError("The microphone wouldn't start. Try again, or type your answer.")
        }

        self.engine = engine
        self.request = request
        task = Self.recognize(with: recognizer, request) { [weak self] text, final, failed in
            Task { @MainActor in
                guard let self, self.take == mine else { return }
                if let text { self.transcript = text }
                if final || failed { self.gotFinal = true; self.stopEngine() }
            }
        }
        recording = true
    }

    /// Stop listening and wait briefly for the last words to land.
    func stop() async -> String {
        guard recording else { return transcript }
        let mine = take
        finishing = true
        stopEngine()
        request?.endAudio()
        let deadline = Date().addingTimeInterval(1.5)
        while take == mine, !gotFinal, Date() < deadline {
            try? await Task.sleep(for: .milliseconds(50))
        }
        if take == mine {
            task?.cancel()
            task = nil
            request = nil
            finishing = false
        }
        return transcript
    }

    /// Drop everything, mid-sentence or not.
    func cancel() {
        take += 1
        stopEngine()
        task?.cancel()
        task = nil
        request = nil
        transcript = ""
        finishing = false
    }

    private func stopEngine() {
        if let engine {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        engine = nil
        recording = false
        level = 0
    }

    // MARK: Off the main actor

    /*
      The tap and the recognition handler run on audio and recognition
      threads. Closures written inside a main-actor method inherit its
      isolation, and Swift 6 traps when they're called from another thread.
      These are built in nonisolated functions so they don't, and forward
      plain values back for the main actor to pick up.
    */

    @concurrent nonisolated private static func speechAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        let current = SFSpeechRecognizer.authorizationStatus()
        guard current == .notDetermined else { return current }
        return await withCheckedContinuation { done in
            SFSpeechRecognizer.requestAuthorization { done.resume(returning: $0) }
        }
    }

    nonisolated private static func installTap(on input: AVAudioInputNode, format: AVAudioFormat,
                                               feeding request: SFSpeechAudioBufferRecognitionRequest,
                                               level: @escaping @Sendable (Double) -> Void) {
        let feed = Feed(request)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            feed.request.append(buffer)
            guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
            var sum: Float = 0
            for i in 0..<Int(buffer.frameLength) { sum += samples[i] * samples[i] }
            let rms = (sum / Float(buffer.frameLength)).squareRoot()
            // Speech sits around 0.01–0.2 RMS; spread that over 0…1.
            level(Double(min(1, max(0, (20 * log10(max(rms, 0.000_01)) + 50) / 40))))
        }
    }

    nonisolated private static func recognize(with recognizer: SFSpeechRecognizer,
                                              _ request: SFSpeechAudioBufferRecognitionRequest,
                                              update: @escaping @Sendable (String?, Bool, Bool) -> Void) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request) { result, error in
            update(result?.bestTranscription.formattedString, result?.isFinal ?? false, error != nil)
        }
    }
}

/// Carries the request into the audio tap. The request is documented as
/// safe to append to from the audio thread; it just isn't marked Sendable.
nonisolated private final class Feed: @unchecked Sendable {
    let request: SFSpeechAudioBufferRecognitionRequest
    init(_ request: SFSpeechAudioBufferRecognitionRequest) { self.request = request }
}

struct RecognizerError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
