import SwiftUI

/// The counselor — conversations, plus interview practice, which is the
/// counselor too: same voice, same knowledge of the student.
struct CounselorView: View {
    @Environment(AppModel.self) private var model
    @State private var store = CounselorStore()
    @State private var path = NavigationPath()
    @State private var starting = false

    /// The web's starters. Generic on purpose — no invented grades.
    static let starters = [
        "Am I being realistic?",
        "What schools am I missing?",
        "How do I stand out with my grades?",
        "Explain early decision vs. early action",
        "Is this school worth the money?",
    ]

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                // The counselor answers from the profile; without one the
                // server refuses ("Finish onboarding first").
                if model.snapshot != nil && model.snapshot?.profile == nil {
                    Page {
                        SectionLabel("Counselor")
                        TwoTone(lead: "Finish onboarding first.", rest: "Your counselor reads your profile before it says anything.")
                        Link("Start onboarding on the web →", destination: Config.apiBaseURL.appending(path: "onboarding"))
                            .font(.system(size: 16, weight: .medium)).foregroundStyle(Color.accent)
                    }
                } else {
                    home
                }
            }
            .navigationTitle("Counselor")
            .navigationBarTitleDisplayMode(.inline)
            .paperChrome()
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { start() } label: { Image(systemName: "square.and.pencil") }
                        .disabled(starting)
                        .accessibilityLabel("New conversation")
                }
            }
            .navigationDestination(for: ThreadRoute.self) { ChatView(store: store, threadId: $0.id) }
            .navigationDestination(for: InterviewRoute.self) { _ in InterviewView() }
            .schoolDestination()
        }
        .task { if !store.loaded && model.snapshot?.profile != nil { await store.load() } }
        // "Ask the counselor" on a school page lands here.
        .task(id: model.askAbout?.id) {
            guard let school = model.askAbout else { return }
            model.askAbout = nil
            path = NavigationPath()
            start(about: school)
        }
        .alert("Something went wrong",
               isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.error ?? "")
        }
    }

    private var home: some View {
        Page(spacing: 24) {
            SectionLabel("Counselor")
            TwoTone(lead: "Ask me anything.", rest: "I've read your profile.")

            VStack(alignment: .leading, spacing: 10) {
                SectionLabel("Start with")
                FlowLayout {
                    ForEach(Self.starters, id: \.self) { q in
                        Chip(label: q, active: false) { start(asking: q) }
                    }
                }
            }
            .disabled(starting)

            NavigationLink(value: InterviewRoute()) {
                HStack(spacing: 14) {
                    Image(systemName: "person.2.wave.2").font(.system(size: 18)).foregroundStyle(Color.ink)
                        .frame(width: 44, height: 44).background(Color.surface, in: Circle())
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Practice an interview").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink)
                        Text("Answer real questions, get honest feedback — saved per school.").font(.system(size: 14)).foregroundStyle(Color.grayStrong)
                    }
                    Spacer()
                    RoundIcon(icon: "arrow.up.right", fill: .surface)
                }
                .padding(16)
                .background(Color.mist, in: RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
            }
            .buttonStyle(.plain)

            if !store.loaded {
                ProgressView().frame(maxWidth: .infinity)
            } else if !store.threads.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel("Conversations")
                    ForEach(store.threads.reversed()) { thread in
                        NavigationLink(value: ThreadRoute(id: thread.id)) { ThreadCard(thread: thread) }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button("Delete conversation", role: .destructive) { Task { await store.delete(thread.id) } }
                            }
                    }
                }
            }
        }
        .refreshable { await store.load() }
    }

    private func start(about school: School? = nil, asking question: String? = nil) {
        starting = true
        Task {
            defer { starting = false }
            guard let id = await store.start(about: school) else { return }
            path.append(ThreadRoute(id: id))
            if let question { await store.send(question, in: id) }
        }
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
    @FocusState private var composing: Bool

    var body: some View {
        let thread = store.thread(threadId)
        let thinking = store.pending.contains(threadId)
        let studentHasSpoken = thread?.messages.contains { $0.author == .user } ?? false

        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    ForEach(thread?.messages ?? []) { MessageView(message: $0, store: store).id($0.id) }
                    if thinking {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("Thinking…").foregroundStyle(Color.grayMid)
                        }
                        .id("thinking")
                    }
                    if !studentHasSpoken && !thinking {
                        FlowLayout {
                            ForEach(CounselorView.starters, id: \.self) { q in
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
        }
        .background(Color.paper)
        .safeAreaInset(edge: .bottom) {
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Ask your counselor", text: $draft, axis: .vertical)
                    .lineLimit(1...6)
                    .focused($composing)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 20))
                    .overlay(RoundedRectangle(cornerRadius: 20).stroke(composing ? Color.ink : Color.hairline))
                Button(action: send) {
                    Image(systemName: "arrow.up").font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 38, height: 38)
                        .background(Color.ink.opacity(canSend ? 1 : 0.3), in: Circle())
                }
                .disabled(!canSend)
                .accessibilityLabel("Send")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.paper)
            .overlay(alignment: .top) { Rectangle().fill(Color.hairline).frame(height: 1) }
        }
        .navigationTitle(thread?.title ?? "Conversation")
        .navigationBarTitleDisplayMode(.inline)
        .paperChrome()
    }

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !store.pending.contains(threadId)
    }

    private func send() {
        let text = draft
        draft = ""
        Task { await store.send(text, in: threadId) }
    }
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
