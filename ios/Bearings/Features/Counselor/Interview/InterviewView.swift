import SwiftUI

/// Interview practice, inside the counselor — a spoken back-and-forth.
/// She asks a question aloud, the words appearing as she says them; the
/// student taps the mic and answers out loud (or types); she replies aloud
/// with what worked, what to work on, and the next question. One turn at a
/// time, the way the real thing goes. See InterviewSession for the phases.
struct InterviewView: View {
    @Environment(AppModel.self) private var model
    @State private var session = InterviewSession()
    @AppStorage("interviewVoiceMuted") private var muted = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The student chose the keyboard, or speaking isn't available.
    @State private var typing = false
    @State private var showEarlier = false
    /// The question on screen. Each gets its own page, so the next one is a
    /// fresh start; earlier ones in the sitting are a swipe back.
    @State private var page: UUID?

    var body: some View {
        Group {
            if session.phase == .choosing { chooser } else { conversation }
        }
        .navigationTitle("Interview practice")
        .navigationBarTitleDisplayMode(.inline)
        .paperChrome()
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { muted.toggle() } label: {
                    Image(systemName: muted ? "speaker.slash" : "speaker.wave.2")
                }
                .accessibilityLabel(muted ? "Read aloud is off" : "Read aloud is on")
                .accessibilityHint(muted ? "Turns my voice on" : "Mutes my voice; questions and replies still appear as text")
            }
            if session.phase != .choosing {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("End") { session.end() }
                        .accessibilityLabel("End practice")
                }
            }
        }
        .task {
            session.model = model
            if session.state == nil { await session.load() }
        }
        .onChange(of: muted, initial: true) { session.voice.muted = muted }
        .onChange(of: reduceMotion, initial: true) { session.voice.reduceMotion = reduceMotion }
        // Recognition can end on its own — a long pause, a phone call.
        .onChange(of: session.ears.recording) { _, now in if !now { session.recordingEnded() } }
        .onChange(of: session.ears.unavailable) { _, why in if why != nil { typing = true } }
        .onDisappear {
            session.end()
            InterviewAudio.deactivate()
        }
    }

    // MARK: Choosing

    /// Short enough that Start is on screen without scrolling: the three
    /// steps and the button. Practice is general — the questions an
    /// interviewer anywhere would ask — so there's no school to pick.
    private var chooser: some View {
        Page(spacing: 22) {
            TwoTone(lead: "Practice the conversation", rest: "before it counts.")

            HowItWorks()

            if let left = model.sample?.interview {
                Label(left > 0
                      ? "\(left) free practice question\(left == 1 ? "" : "s") — about one session. Pro is unlimited."
                      : "You've used your free practice. Pro lets you keep going.",
                      systemImage: left > 0 ? "mic" : "lock.fill")
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(Color.grayStrong)
            }

            if let error = session.error { InlineNote(text: error, kind: .problem) }

            Button { Task { await session.start() } } label: {
                Label("Start practice", systemImage: "mic")
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(session.state == nil || session.loading)

            if session.state == nil && session.error == nil {
                ProgressView().frame(maxWidth: .infinity)
            }

            Label("It's a conversation, not an exam — one real story beats a rehearsed speech.", systemImage: "lightbulb")
                .font(.system(size: 14)).foregroundStyle(Color.grayStrong)

            if !session.earlier.isEmpty { earlierPractice }
        }
    }

    /// Saved turns from past sittings for this school, newest first — kept
    /// out of the way so they never read as part of the conversation.
    private var earlierPractice: some View {
        VStack(alignment: .leading, spacing: 16) {
            Button { withAnimation(reduceMotion ? nil : .default) { showEarlier.toggle() } } label: {
                HStack {
                    SectionLabel("Earlier practice · \(session.earlier.count)")
                    Spacer()
                    Image(systemName: showEarlier ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.grayMid)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(showEarlier ? "Hides past answers" : "Shows past answers and feedback")

            if showEarlier {
                ForEach(Array(session.earlier.enumerated().reversed()), id: \.offset) { _, turn in
                    VStack(alignment: .leading, spacing: 10) {
                        Text(turn.question).font(.system(size: 16, weight: .medium))
                        Text(turn.answer).font(.system(size: 15)).foregroundStyle(Color.grayStrong)
                            .padding(.leading, 12)
                            .overlay(alignment: .leading) { Rectangle().fill(Color.hairline).frame(width: 2) }
                        FeedbackCards(feedback: turn.feedback)
                    }
                }
            }
        }
        .padding(.top, 8)
    }

    // MARK: The conversation

    private var conversation: some View {
        VStack(spacing: 0) {
            pageHeader
            TabView(selection: $page) {
                ForEach(session.exchanges) { exchange in
                    ExchangePage(exchange: exchange, session: session, reduceMotion: reduceMotion)
                        .tag(Optional(exchange.id))
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .background(Color.paper)
        }
        .safeAreaInset(edge: .bottom) { dock }
        // A new question slides in as a new page.
        .onChange(of: session.current?.id, initial: true) { _, id in
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.35)) { page = id }
        }
    }

    private var pageIndex: Int? { session.exchanges.firstIndex { $0.id == page } }
    private var viewingCurrent: Bool { page == nil || page == session.current?.id }

    /// Where they are in the sitting, with arrows to step through it.
    private var pageHeader: some View {
        let i = pageIndex ?? max(0, session.exchanges.count - 1)
        let count = session.exchanges.count
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                SectionLabel(session.schoolName ?? "General practice")
                Text(count > 1 ? "Question \(i + 1) of \(count)" : "Question 1")
                    .font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.ink)
            }
            Spacer()
            if count > 1 {
                pageArrow("chevron.left", label: "Previous question", to: i - 1)
                pageArrow("chevron.right", label: "Next question in this sitting", to: i + 1)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(Color.paper)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.hairline).frame(height: 1) }
    }

    private func pageArrow(_ icon: String, label: String, to target: Int) -> some View {
        let valid = session.exchanges.indices.contains(target)
        return Button {
            guard valid else { return }
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) { page = session.exchanges[target].id }
        } label: {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .frame(width: 36, height: 36)
                .background(Color.surface, in: Circle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(valid ? Color.ink : Color.grayMid.opacity(0.5))
        .disabled(!valid)
        .accessibilityLabel(label)
    }

    /// Whatever the current turn asks of the student, pinned to the bottom.
    @ViewBuilder
    private var dock: some View {
        // Looking back at an earlier question: the way back to this one.
        // Not mid-recording, though — the stop button stays reachable.
        let lookingBack = !viewingCurrent && !session.ears.recording && !session.ears.finishing
        let content = VStack(alignment: .leading, spacing: 12) {
            if lookingBack {
                Button {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) { page = session.current?.id }
                } label: {
                    Label("Back to question \(session.exchanges.count)", systemImage: "arrow.right")
                }
                .buttonStyle(InkButtonStyle())
                .frame(maxWidth: .infinity)
            } else {
                if let error = session.error { InlineNote(text: error, kind: .problem) }
                switch session.phase {
                case .asking: askingControls
                case .answering: answeringControls
                case .feedback: feedbackControls
                case .thinking, .choosing: EmptyView()
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.paper)
        .overlay(alignment: .top) { Rectangle().fill(Color.hairline).frame(height: 1) }

        if lookingBack || session.phase != .thinking || session.error != nil { content }
    }

    private var askingControls: some View {
        HStack(spacing: 12) {
            Text(session.voice.preparing ? "Getting ready to ask…" : muted ? "Read the question…" : "Listen…")
                .font(.system(size: 15)).foregroundStyle(Color.grayStrong)
            Spacer()
            Button("Answer now") { session.answerNow() }
                .buttonStyle(OutlineButtonStyle(compact: true))
        }
    }

    @ViewBuilder
    private var answeringControls: some View {
        let ears = session.ears
        if ears.recording || ears.finishing {
            VStack(spacing: 12) {
                ScrollView {
                    Text(ears.transcript.isEmpty ? "Listening…" : ears.transcript)
                        .font(.system(size: 16))
                        .foregroundStyle(ears.transcript.isEmpty ? Color.grayMid : Color.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .defaultScrollAnchor(.bottom)
                .frame(maxHeight: 120)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel(ears.transcript.isEmpty ? "Listening" : "Heard so far: \(ears.transcript)")

                RecordButton(recording: true, level: ears.level, reduceMotion: reduceMotion) {
                    Task { await session.stopRecording() }
                }
                .disabled(ears.finishing)
                Text(ears.finishing ? "Catching your last words…" : "Tap to send your answer")
                    .font(.system(size: 13)).foregroundStyle(Color.grayMid)
            }
            .frame(maxWidth: .infinity)
        } else if typing || !session.answer.isEmpty {
            if let why = ears.unavailable { Muted(why, size: 13) }
            TextArea(placeholder: "Answer as if you're speaking. Don't polish — talk.",
                     text: $session.answer, minLines: 3)
            HStack(spacing: 16) {
                if ears.unavailable == nil {
                    Button {
                        Task { await session.startRecording() }
                    } label: {
                        Label(session.answer.isEmpty ? "Speak instead" : "Record again", systemImage: "mic")
                    }
                    .buttonStyle(LinkButtonStyle(color: .grayStrong))
                }
                Button("Hear it again") { Task { await session.replayQuestion() } }
                    .buttonStyle(LinkButtonStyle(color: .grayStrong))
                Spacer()
                Button("Send") { Task { await session.submit() } }
                    .buttonStyle(InkButtonStyle(compact: true))
                    .disabled(session.answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        } else {
            VStack(spacing: 10) {
                RecordButton(recording: false, level: 0, reduceMotion: reduceMotion) {
                    Task { await session.startRecording() }
                }
                Text("Tap and answer out loud").font(.system(size: 13)).foregroundStyle(Color.grayMid)
                HStack(spacing: 20) {
                    Button("Type instead") { typing = true }
                    Button("Hear it again") { Task { await session.replayQuestion() } }
                }
                .buttonStyle(LinkButtonStyle(color: .grayStrong))
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var feedbackControls: some View {
        HStack(spacing: 12) {
            RoundIconButton(icon: session.voice.speaking ? "stop.fill" : "speaker.wave.2",
                            fill: .lavender, size: 44,
                            label: session.voice.speaking ? "Stop" : "Hear my reply again") {
                Task { await session.toggleReply() }
            }
            Spacer()
            Button { Task { await session.next() } } label: {
                Label("Next question", systemImage: "arrow.right")
            }
            .buttonStyle(InkButtonStyle())
        }
    }
}

// MARK: Pieces

/// One question's page: scrolls on its own, and keeps the newest part of
/// the current turn in view as her reply and cards arrive.
private struct ExchangePage: View {
    let exchange: InterviewSession.Exchange
    let session: InterviewSession
    let reduceMotion: Bool

    var body: some View {
        let isCurrent = exchange.id == session.current?.id
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ExchangeView(exchange: exchange, session: session)
                    if isCurrent, session.phase == .thinking {
                        ThinkingLine(reduceMotion: reduceMotion)
                    }
                    Color.clear.frame(height: 1).id("end")
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDismissesKeyboard(.interactively)
            .defaultScrollAnchor(.bottom, for: .sizeChanges)
            .onChange(of: session.phase) {
                guard isCurrent else { return }
                withAnimation(reduceMotion ? nil : .default) { proxy.scrollTo("end", anchor: .bottom) }
            }
        }
    }
}

/// One question in the sitting: hers, the student's answer, her reply.
private struct ExchangeView: View {
    let exchange: InterviewSession.Exchange
    let session: InterviewSession

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            CounselorLine(line: exchange.question, voice: session.voice, size: 18, weight: .medium)

            let isCurrent = exchange.id == session.current?.id
            if let answer = exchange.answer ?? (isCurrent ? session.sent : nil) {
                StudentLine(text: answer)
            }

            if let fb = exchange.feedback {
                CounselorLine(line: fb.followUp, voice: session.voice, size: 16, weight: .regular)
                if exchange.cardsShown {
                    FeedbackCards(feedback: fb)
                        .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .animation(reduceMotion ? nil : .spring(duration: 0.45), value: exchange.cardsShown)
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
}

/// The three steps, side by side — what used to be two paragraphs.
private struct HowItWorks: View {
    private let steps = [
        ("waveform", "I ask out loud"),
        ("mic.fill", "You answer by voice"),
        ("text.bubble.fill", "Honest feedback"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 8) {
                ForEach(steps, id: \.1) { icon, label in
                    VStack(spacing: 8) {
                        Image(systemName: icon)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Color.ink)
                            .frame(width: 44, height: 44)
                            .background(Color.surface, in: Circle())
                        Text(label)
                            .font(.system(size: 13, weight: .medium))
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            Label("Your recording never leaves your iPhone.", systemImage: "lock.fill")
                .font(.system(size: 12)).foregroundStyle(Color.grayStrong)
                .frame(maxWidth: .infinity)
        }
        .padding(16)
        .background(Color.lavender, in: RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("How it works: I ask out loud, you answer by voice, then honest feedback. Your recording never leaves your iPhone.")
    }
}

/// Something the counselor says, revealed as she says it. The whole line is
/// laid out from the start, unrevealed words drawn clear, so the bubble is
/// its final size and nothing below it jumps.
private struct CounselorLine: View {
    let line: String
    let voice: CounselorVoice
    var size: CGFloat
    var weight: Font.Weight

    var body: some View {
        let live = voice.text == line
        let waiting = live && voice.preparing && voice.revealed == 0
        HStack {
            (Text(live ? voice.shownText : line).foregroundStyle(Color.ink)
                + Text(live ? voice.hiddenText : "").foregroundStyle(Color.clear))
                .font(.system(size: size, weight: weight))
                .fixedSize(horizontal: false, vertical: true)
                .overlay(alignment: .topLeading) { if waiting { TypingDots().padding(.top, 6) } }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(Color.lavender, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
        .padding(.trailing, 32)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(line)
    }
}

private struct StudentLine: View {
    let text: String

    var body: some View {
        HStack {
            Spacer(minLength: 48)
            Text(text)
                .font(.system(size: 16))
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.fill, in: RoundedRectangle(cornerRadius: 16))
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("You said: \(text)")
    }
}

/// Her verdict on one answer: a nudge if it was too thin, then what's
/// working and what to work on, each its own card.
private struct FeedbackCards: View {
    let feedback: InterviewFeedback

    var body: some View {
        VStack(spacing: 12) {
            if feedback.tooBrief == true { TooBriefCard() }
            if !feedback.strengths.isEmpty {
                FeedbackList(title: "What's working", icon: "hand.thumbsup.fill", bullet: "checkmark",
                             accent: .accent, tint: .accentSoft, items: feedback.strengths)
            }
            if !feedback.toWorkOn.isEmpty {
                FeedbackList(title: "To work on", icon: "scope", bullet: "arrow.up.right",
                             accent: .ink, tint: .surface, items: feedback.toWorkOn)
            }
        }
    }
}

/// One side of the feedback: a tinted card, its icon badge, and each point
/// marked with a small filled dot of the same colour.
private struct FeedbackList: View {
    let title: String
    let icon: String
    let bullet: String
    let accent: Color
    let tint: Color
    let items: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(accent, in: Circle())
                Text(title).font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.ink)
            }
            ForEach(items, id: \.self) { item in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: bullet)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(accent)
                        .frame(width: 22, height: 22)
                        .background(tint == .surface ? Color.mist : Color.surface, in: Circle())
                        .padding(.top, 1)
                    Text(item)
                        .font(.system(size: 15))
                        .foregroundStyle(Color.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// A short or vague answer, called out before anything else: it's the most
/// useful thing to hear about it.
private struct TooBriefCard: View {
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "text.badge.plus")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.ink)
                .frame(width: 32, height: 32)
                .background(Color.surface, in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text("Give me more than that").font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.ink)
                Text("A real answer runs about a minute out loud. Pick one specific moment, say what you did, and why it mattered.")
                    .font(.system(size: 15)).foregroundStyle(Color.ink.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.highlight, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// The big round mic. While recording, a ring breathes with the student's
/// voice so they can see they're being heard.
private struct RecordButton: View {
    let recording: Bool
    let level: Double
    let reduceMotion: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(Color.lavenderStrong)
                    .frame(width: 84, height: 84)
                    .scaleEffect(recording && !reduceMotion ? 1 + level * 0.3 : 1)
                    .opacity(recording ? 1 : 0)
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: level)
                Circle().fill(Color.ink).frame(width: 68, height: 68)
                Image(systemName: recording ? "stop.fill" : "mic.fill")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: 110, height: 110)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(recording ? "Stop recording" : "Record your answer")
    }
}

/// While she reads the answer — a calm line that changes, so a long wait
/// doesn't look stuck.
private struct ThinkingLine: View {
    let reduceMotion: Bool
    private static let lines = [
        "Listening back to what you said…",
        "Finding the part that landed…",
        "Deciding what to push you on…",
        "Thinking about what I'd ask next…",
    ]

    var body: some View {
        TimelineView(.periodic(from: .now, by: 2.8)) { context in
            let i = Int(context.date.timeIntervalSinceReferenceDate / 2.8) % Self.lines.count
            HStack(spacing: 10) {
                ProgressView()
                Text(Self.lines[i]).font(.system(size: 15)).foregroundStyle(Color.grayStrong)
                    .contentTransition(.opacity)
                    .animation(reduceMotion ? nil : .easeInOut, value: i)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Your counselor is reading your answer")
    }
}

/// Three dots while her voice loads.
private struct TypingDots: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            HStack(spacing: 5) {
                ForEach(0..<3) { i in
                    Circle().fill(Color.grayStrong)
                        .frame(width: 7, height: 7)
                        .opacity(reduceMotion ? 0.6 : 0.3 + 0.7 * max(0, sin(t * 4 - Double(i) * 0.7)))
                }
            }
        }
        .accessibilityHidden(true)
    }
}
