import SwiftUI

/// "About you" — what the counselor remembers, by topic. It learns from
/// conversations; this is where the student sees exactly what it believes,
/// fixes what's wrong, and tells it things directly.
struct MemorySection: View {
    @Environment(AppModel.self) private var model
    @State private var topics: [MemoryTopic] = []
    @State private var facts: [MemoryFact] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var editing: MemoryEdit?

    var body: some View {
        // The counselor's memory is Pro. Free still sets where they live —
        // that's their data, not her insight.
        if model.isPro { full } else {
            VStack(alignment: .leading, spacing: 16) {
                LockedCard(icon: "sparkles", title: "What I know about you",
                           teaser: "Everything you tell your counselor, remembered — so you never have to repeat yourself.")
                HomeStateRow()
            }
        }
    }

    private var full: some View {
        VStack(alignment: .leading, spacing: 16) {
            Panel(icon: "sparkles", title: "What I know about you",
                  subtitle: facts.isEmpty ? "Nothing yet" : "\(facts.count) thing\(facts.count == 1 ? "" : "s") you've shared",
                  tint: .lavender) {
                Muted("I pick these up as we talk — your goals, what you've done, what matters to you in a college, what you're working around — and read them before every answer, so you never have to repeat yourself. If something's wrong or out of date, fix it here.", size: 14)
                Button { editing = .add(topic: nil) } label: { Label("Tell me something", systemImage: "plus") }
                    .buttonStyle(HighlightButtonStyle(compact: true))
            }

            HomeStateRow()

            if let error { InlineNote(text: error, kind: .problem) }

            if !loaded {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 20)
            } else {
                ForEach(topics) { topic in
                    let mine = facts.filter { $0.category == topic.id }
                    Panel(icon: topic.icon, title: topic.label, subtitle: topic.description,
                          tint: .surface) {
                        if mine.isEmpty {
                            Muted("Nothing yet — mention it in a chat, or add it yourself.", size: 14)
                        } else {
                            VStack(spacing: 8) {
                                ForEach(mine) { fact in FactRow(fact: fact) { editing = .edit(fact) } }
                            }
                        }
                        Button { editing = .add(topic: topic.id) } label: { Label("Add", systemImage: "plus") }
                            .buttonStyle(LinkButtonStyle(color: .grayStrong))
                    }
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $editing) { target in
            MemoryEditSheet(target: target, topics: topics) { result in
                Task { await apply(result) }
            }
            .presentationDetents([.medium, .large])
            .presentationBackground(Color.paper)
        }
    }

    private func load() async {
        do {
            let res: MemoryResponse = try await model.api.get("/api/v1/memory")
            topics = res.categories
            facts = res.facts
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    private func apply(_ result: MemoryEditResult) async {
        struct Body: Encodable { let category: String; let fact: String }
        do {
            switch result {
            case .add(let category, let fact):
                let saved: MemoryFact = try await model.api.post("/api/v1/memory", Body(category: category, fact: fact))
                facts.append(saved)
            case .update(let id, let category, let fact):
                try await model.api.perform("PATCH", "/api/v1/memory/\(id)", Body(category: category, fact: fact))
                if let i = facts.firstIndex(where: { $0.id == id }) { facts[i].fact = fact; facts[i].category = category }
            case .delete(let id):
                let before = facts
                facts.removeAll { $0.id == id }
                do { try await model.api.perform("DELETE", "/api/v1/memory/\(id)") } catch { facts = before; throw error }
            }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct FactRow: View {
    let fact: MemoryFact
    let edit: () -> Void

    var body: some View {
        Button(action: edit) {
            HStack(alignment: .top, spacing: 10) {
                Text(fact.fact)
                    .font(.system(size: 15))
                    .foregroundStyle(Color.ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 6)
                // What the student typed themselves, versus what was heard in chat.
                Image(systemName: fact.source == "student" ? "person.fill" : "bubble.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(Color.grayMid)
                    .padding(.top, 4)
                    .accessibilityLabel(fact.source == "student" ? "You added this" : "From a conversation")
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.mist, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Edit or remove")
    }
}

enum MemoryEdit: Identifiable {
    case add(topic: String?)
    case edit(MemoryFact)

    var id: String {
        switch self {
        case .add(let t): "add-\(t ?? "")"
        case .edit(let f): f.id
        }
    }
}

enum MemoryEditResult {
    case add(category: String, fact: String)
    case update(id: String, category: String, fact: String)
    case delete(id: String)
}

/// Add something, or fix / remove something the counselor got wrong.
private struct MemoryEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    let target: MemoryEdit
    let topics: [MemoryTopic]
    let done: (MemoryEditResult) -> Void

    @State private var text = ""
    @State private var topic = ""
    @State private var confirmingDelete = false

    private var existing: MemoryFact? { if case .edit(let f) = target { f } else { nil } }

    var body: some View {
        NavigationStack {
            Page(spacing: 20) {
                Muted(existing == nil
                      ? "Write it the way you'd say it to me. I'll keep it in mind for every answer from now on."
                      : "Correct it, move it, or remove it. I'll use the new version from your next message.",
                      size: 14)
                TextArea(placeholder: "e.g. I want to stay close to home for my family", text: $text, minLines: 3)
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel("Topic")
                    FlowLayout {
                        ForEach(topics) { t in Chip(label: t.label, active: topic == t.id) { topic = t.id } }
                    }
                }
                if let existing {
                    Button("Remove this", role: .destructive) { confirmingDelete = true }
                        .buttonStyle(LinkButtonStyle(color: .reach))
                        .confirmationDialog("I'll forget this.", isPresented: $confirmingDelete, titleVisibility: .visible) {
                            Button("Remove", role: .destructive) { done(.delete(id: existing.id)); dismiss() }
                        }
                }
            }
            .navigationTitle(existing == nil ? "Tell me something" : "Edit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let fact = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        if let existing { done(.update(id: existing.id, category: topic, fact: fact)) }
                        else { done(.add(category: topic, fact: fact)) }
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || topic.isEmpty)
                }
            }
        }
        .onAppear {
            switch target {
            case .add(let t): topic = t ?? topics.first?.id ?? ""
            case .edit(let f): text = f.fact; topic = f.category
            }
        }
    }
}
