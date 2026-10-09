import SwiftUI

/// The counselor. Opens ready to talk: a composer at the bottom, starter
/// questions and interview practice above it. The first message starts a
/// conversation; past conversations are one tap away in the top corner.
struct CounselorView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var store = CounselorStore()
    @State private var path = NavigationPath()
    @State private var draft = ""
    /// Set when the student arrived from a school's "Ask the counselor".
    @State private var about: School?
    @State private var starting = false
    /// Drawn once per opening, so they change from visit to visit but not
    /// while the student is reading them.
    @State private var starters = Starters.draw()

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                // The counselor answers from the profile; without one the
                // server refuses ("Finish onboarding first").
                if model.snapshot != nil && model.snapshot?.profile == nil {
                    Page {
                        TwoTone(lead: "Finish onboarding first.", rest: "I read your profile before I say anything.")
                        Link("Start onboarding on the web →", destination: Config.apiBaseURL.appending(path: "onboarding"))
                            .font(.system(size: 16, weight: .medium)).foregroundStyle(Color.accent)
                    }
                } else {
                    composerHome
                }
            }
            .rootScreen("Counselor")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink(value: ConversationsRoute()) {
                        Image(systemName: "list.bullet")
                    }
                    .accessibilityLabel("Past conversations")
                }
            }
            .navigationDestination(for: ConversationsRoute.self) { _ in ConversationsView(store: store) }
            .navigationDestination(for: ThreadRoute.self) { ChatView(store: store, threadId: $0.id) }
            .navigationDestination(for: InterviewRoute.self) { _ in InterviewView() }
            .navigationDestination(for: YouRoute.self) { _ in YouView() }
            .schoolDestination()
        }
        .task { if !store.loaded && model.snapshot?.profile != nil { await store.load() } }
        // "Ask the counselor" on a school page lands here, with that school
        // attached to the next message.
        .task(id: model.askAbout?.id) {
            guard let school = model.askAbout else { return }
            model.askAbout = nil
            path = NavigationPath()
            about = school
        }
        .alert("Something went wrong",
               isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.error ?? "")
        }
    }

    private var composerHome: some View {
        Page(spacing: 24) {
            TwoTone(lead: "Ask me anything.", rest: "I've read your profile.")

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel("Start with")
                FlowLayout {
                    ForEach(about.map(Starters.about) ?? starters, id: \.self) { q in
                        Chip(label: q, active: false) { begin(q) }
                    }
                }
            }
            .disabled(starting)

            // What it knows about you — and where you can correct it.
            NavigationLink(value: YouRoute()) {
                HStack(spacing: 14) {
                    Image(systemName: "sparkles").font(.system(size: 18)).foregroundStyle(Color.ink)
                        .frame(width: 44, height: 44).background(Color.surface, in: Circle())
                    VStack(alignment: .leading, spacing: 3) {
                        Text("What I know about you").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink)
                        Text("Everything you've told me, your grades and activities — fix anything that's off.").font(.system(size: 14)).foregroundStyle(Color.grayStrong)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer()
                    RoundIcon(icon: "arrow.up.right", fill: .surface)
                }
                .padding(16)
                .background(Color.lavender, in: RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
                .softShadow()
            }
            .buttonStyle(.plain)

            NavigationLink(value: InterviewRoute()) {
                HStack(spacing: 14) {
                    Image(systemName: "person.2.wave.2").font(.system(size: 18)).foregroundStyle(Color.ink)
                        .frame(width: 44, height: 44).background(Color.mist, in: Circle())
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Practice an interview").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink)
                        Text("I'll ask out loud, you answer by voice — then honest feedback, one question at a time.").font(.system(size: 14)).foregroundStyle(Color.grayStrong)
                    }
                    Spacer()
                    RoundIcon(icon: "arrow.up.right", fill: .mist)
                }
                .padding(16)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
                .softShadow()
            }
            .buttonStyle(.plain)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(alignment: .leading, spacing: 8) {
                if let about {
                    AboutTag(school: about) { self.about = nil }
                }
                ChatComposer(draft: $draft, busy: starting,
                             placeholder: about.map { "Ask about \($0.shortName)" } ?? "Ask your counselor") {
                    let text = draft
                    draft = ""
                    begin(text)
                }
            }
        }
    }

    /// Start a conversation with this message, then open it.
    private func begin(_ text: String) {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !starting else { return }
        starting = true
        let school = about
        Task {
            defer { starting = false }
            guard let id = await store.create(about: school) else { draft = message; return }
            about = nil
            path.append(ThreadRoute(id: id))
            await store.send(message, in: id)
        }
    }
}

struct ConversationsRoute: Hashable {}

/// Past conversations, newest first — the L2 behind the list icon.
struct ConversationsView: View {
    let store: CounselorStore

    var body: some View {
        Group {
            if !store.loaded {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).background(Color.paper)
            } else if store.threads.isEmpty {
                Page {
                    TwoTone(lead: "No conversations yet.", rest: "Ask something and it'll be kept here.")
                }
            } else {
                Page(spacing: 12) {
                    ForEach(store.threads.reversed()) { thread in
                        NavigationLink(value: ThreadRoute(id: thread.id)) { ThreadCard(thread: thread) }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button("Delete conversation", role: .destructive) { Task { await store.delete(thread.id) } }
                            }
                    }
                    Text("Press and hold a conversation to delete it.")
                        .font(.system(size: 12)).foregroundStyle(Color.grayMid)
                }
                .refreshable { await store.load() }
            }
        }
        .navigationTitle("Conversations")
        .navigationBarTitleDisplayMode(.inline)
        .paperChrome()
        .task { if !store.loaded { await store.load() } }
    }
}

/// The message box, shared by a fresh chat and an ongoing one.
struct ChatComposer: View {
    @Binding var draft: String
    var busy = false
    var placeholder = "Ask your counselor"
    let send: () -> Void
    @FocusState private var focused: Bool

    private var canSend: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !busy }

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField(placeholder, text: $draft, axis: .vertical)
                .lineLimit(1...6)
                .focused($focused)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(focused ? Color.ink : Color.hairline))
            Button(action: send) {
                Group {
                    if busy { ProgressView().tint(.white) } else { Image(systemName: "arrow.up").font(.system(size: 17, weight: .semibold)) }
                }
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(Color.ink.opacity(canSend || busy ? 1 : 0.3), in: Circle())
            }
            .disabled(!canSend)
            .accessibilityLabel("Send")
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(Color.paper)
        .overlay(alignment: .top) { Rectangle().fill(Color.hairline).frame(height: 1) }
    }
}

struct ThreadRoute: Hashable { let id: String }
struct InterviewRoute: Hashable {}

private struct ThreadCard: View {
    let thread: CounselorThread

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(thread.title).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink).lineLimit(1)
            if let last = thread.messages.last {
                Text(last.text).font(.system(size: 14)).foregroundStyle(Color.grayStrong).lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .surfaceCard()
    }
}

struct ChatView: View {
    @Environment(AppModel.self) private var model
    let store: CounselorStore
    let threadId: String
    @State private var draft = ""
    @State private var starters = Starters.draw()

    var body: some View {
        let thread = store.thread(threadId)
        let thinking = store.pending.contains(threadId)
        let studentHasSpoken = thread?.messages.contains { $0.author == .user } ?? false
        let about = store.aboutSchool(threadId)

        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    ForEach(thread?.messages ?? []) { MessageView(message: $0, store: store).id($0.id) }
                    if thinking {
                        ReplyInProgress(draft: store.inProgress[threadId], about: about)
                            .id("thinking")
                    }
                    if !studentHasSpoken && !thinking {
                        FlowLayout {
                            ForEach(about.map(Starters.about) ?? starters, id: \.self) { q in
                                Chip(label: q, active: false) { Task { await store.send(q, in: threadId) } }
                            }
                        }
                    }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .defaultScrollAnchor(.bottom)
            .onChange(of: thread?.messages.count) {
                withAnimation { proxy.scrollTo(thinking ? "thinking" : thread?.messages.last?.id, anchor: .bottom) }
            }
            // Follow the reply down as it's written.
            .onChange(of: store.inProgress[threadId]?.text.count) {
                proxy.scrollTo("thinking", anchor: .bottom)
            }
        }
        .background(Color.paper)
        .safeAreaInset(edge: .bottom) {
            VStack(alignment: .leading, spacing: 8) {
                // Stays for the whole conversation, so it's clear every
                // question here is about this school.
                if let about { AboutTag(school: about) }
                ChatComposer(draft: $draft, busy: store.pending.contains(threadId),
                             placeholder: about.map { "Ask about \($0.shortName)" } ?? "Ask your counselor",
                             send: send)
            }
        }
        .navigationTitle(thread?.title ?? "Conversation")
        .navigationBarTitleDisplayMode(.inline)
        .paperChrome()
    }

    private func send() {
        let text = draft
        draft = ""
        Task { await store.send(text, in: threadId) }
    }
}

/// "About San Diego State" over the composer: the school this conversation
/// is grounded in. Removable before the first message, fixed after.
private struct AboutTag: View {
    let school: School
    var remove: (() -> Void)?

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "building.columns").font(.system(size: 12))
            Text("About \(school.shortName)").font(.system(size: 13, weight: .medium))
            if let remove {
                Button(action: remove) { Image(systemName: "xmark").font(.system(size: 11, weight: .bold)) }
                    .accessibilityLabel("Don't ask about \(school.shortName)")
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(Color.lavender, in: Capsule())
        .padding(.horizontal, 16)
    }
}

/// The reply while it's being written: the words so far once there are
/// some, and until then a line saying what I'm doing — a few of them in
/// turn, so a long think doesn't look stuck.
private struct ReplyInProgress: View {
    let draft: CounselorStore.Draft?
    let about: School?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let text = draft?.text, !text.isEmpty {
                Text(LocalizedStringKey(text))
            }
            if draft?.text.isEmpty ?? true || draft?.phase == .cards {
                TimelineView(.periodic(from: .now, by: 2.6)) { context in
                    HStack(spacing: 8) {
                        ProgressView()
                        Text(line(at: context.date)).foregroundStyle(Color.grayMid)
                            .contentTransition(.opacity)
                            .animation(.easeInOut(duration: 0.3), value: line(at: context.date))
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func line(at date: Date) -> String {
        let lines = draft?.phase == .cards ? Self.cards : thinkingLines
        let tick = Int(date.timeIntervalSinceReferenceDate / 2.6)
        return lines[tick % lines.count]
    }

    private var thinkingLines: [String] {
        var lines = Self.thinking
        if let about { lines.insert("Looking at \(about.shortName)…", at: 1) }
        return lines
    }

    static let thinking = [
        "Reading what you've told me…",
        "Looking over your list…",
        "Thinking it through…",
        "Checking the numbers…",
        "Weighing a few options…",
        "Pulling it together…",
    ]
    static let cards = ["Pulling up the schools…", "Adding the details…"]
}

private struct MessageView: View {
    @Environment(AppModel.self) private var model
    let message: CounselorMessage
    let store: CounselorStore

    var body: some View {
        if message.author == .user {
            HStack {
                Spacer(minLength: 48)
                Text(message.text)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.fill, in: RoundedRectangle(cornerRadius: 16))
            }
        } else {
            VStack(alignment: .leading, spacing: 12) {
                // The counselor writes light markdown — bold, lists, links.
                Text(LocalizedStringKey(message.text))
                    .textSelection(.enabled)
                ForEach(Array((message.cards ?? []).enumerated()), id: \.offset) { _, card in
                    if case .school(let id, let reason) = card {
                        let school = model.school(id) ?? store.school(id)
                        NavigationLink(value: SchoolRoute(id: id)) {
                            HStack(alignment: .top, spacing: 12) {
                                if let school { SchoolLogo(school: school, size: 40) }
                                VStack(alignment: .leading, spacing: 4) {
                                    if let school {
                                        Text(school.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink)
                                        Text("\(school.city), \(school.state) · \(Format.rate(school.admissions.acceptanceRate)) admit · \(Format.thousands(school.cost.avgNetPrice)) net")
                                            .font(.system(size: 13)).foregroundStyle(Color.grayMid)
                                    }
                                    Text(reason).font(.system(size: 14)).foregroundStyle(Color.grayStrong)
                                        .multilineTextAlignment(.leading)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(14)
                            .surfaceCard()
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}
