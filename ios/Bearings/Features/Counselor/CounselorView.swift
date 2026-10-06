import SwiftUI

/// The counselor — app/(app)/counselor/page.tsx. Conversations first,
/// newest at the top; tap one to keep talking, or start another.
struct CounselorView: View {
    @Environment(AppModel.self) private var model
    @State private var store = CounselorStore()
    @State private var path: [String] = []
    @State private var starting = false

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                // The counselor answers from the profile; without one the
                // server refuses ("Finish onboarding first").
                if model.snapshot != nil && model.snapshot?.profile == nil {
                    ContentUnavailableView {
                        Label("Finish onboarding first", systemImage: "person.text.rectangle")
                    } description: {
                        Text("Your counselor reads your profile before it says anything. That takes about fifteen minutes.")
                    } actions: {
                        Link("Start onboarding on the web", destination: Config.apiBaseURL.appending(path: "onboarding"))
                    }
                } else if !store.loaded {
                    ProgressView()
                } else if store.threads.isEmpty {
                    ContentUnavailableView {
                        Label("Ask anything", systemImage: "bubble.left.and.text.bubble.right")
                    } description: {
                        Text("Your counselor has read your profile. Start wherever you are.")
                    } actions: {
                        Button("Start a conversation", action: start).disabled(starting)
                    }
                } else {
                    List {
                        ForEach(store.threads.reversed()) { thread in
                            NavigationLink(value: thread.id) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(thread.title).font(.system(size: 16, weight: .medium)).lineLimit(1)
                                    if let last = thread.messages.last {
                                        Text(last.text).font(.system(size: 14))
                                            .foregroundStyle(Color.grayStrong).lineLimit(2)
                                    }
                                }
                                .padding(.vertical, 2)
                            }
                        }
                        .onDelete { offsets in
                            let ids = offsets.map { store.threads.reversed()[$0].id }
                            Task { for id in ids { await store.delete(id) } }
                        }
                    }
                    .refreshable { await store.load() }
                }
            }
            .navigationTitle("Counselor")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: start) { Image(systemName: "square.and.pencil") }
                        .disabled(starting)
                        .accessibilityLabel("New conversation")
                }
            }
            .navigationDestination(for: String.self) { ChatView(store: store, threadId: $0) }
        }
        .task { if !store.loaded && model.snapshot?.profile != nil { await store.load() } }
        .alert("Something went wrong",
               isPresented: Binding(get: { store.error != nil }, set: { if !$0 { store.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.error ?? "")
        }
    }

    private func start() {
        starting = true
        Task {
            defer { starting = false }
            if let id = await store.start() { path.append(id) }
        }
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
            .background(.bar)
        }
        .navigationTitle(thread?.title ?? "Conversation")
        .navigationBarTitleDisplayMode(.inline)
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
                        CardView {
                            if let school {
                                Text(school.name).font(.system(size: 16, weight: .medium))
                                Text("\(school.city), \(school.state) · \(Format.rate(school.admissions.acceptanceRate)) admit · \(Format.thousands(school.cost.avgNetPrice)) net")
                                    .font(.system(size: 13)).foregroundStyle(Color.grayMid)
                            }
                            Text(reason).font(.system(size: 15)).foregroundStyle(Color.grayStrong)
                        }
                    }
                }
            }
        }
    }
}
