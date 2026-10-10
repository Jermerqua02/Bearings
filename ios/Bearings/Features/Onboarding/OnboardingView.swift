import SwiftUI

/// The first meeting, in the app — app/onboarding/page.tsx, natively. The
/// welcome tour the first time, then one question at a time, then what the
/// counselor heard, saved as the profile everything else reads.
struct OnboardingView: View {
    @Environment(AppModel.self) private var model
    @State private var stage: Stage = .questions
    @State private var started = false

    enum Stage: Equatable { case tour, questions, summary(String) }

    var body: some View {
        Group {
            switch stage {
            case .tour:
                WelcomeTour(isParent: model.isParent,
                            begin: { model.welcomeTourSeen = true; withAnimation { stage = .questions } },
                            close: { model.welcomeTourSeen = true; model.onboardingOpen = false })
            case .questions:
                OnboardingQuestions(done: { summary in withAnimation { stage = .summary(summary) } })
            case .summary(let text):
                OnboardingSummary(summary: text, back: { withAnimation { stage = .questions } })
            }
        }
        .background(Color.paper)
        .onAppear {
            guard !started else { return }
            started = true
            if !model.welcomeTourSeen && model.onboardingDraft.index == 0 { stage = .tour }
        }
    }
}

// MARK: Questions

private struct OnboardingQuestions: View {
    @Environment(AppModel.self) private var model
    let done: (String) -> Void
    @State private var saving = false
    @State private var error: String?

    private var answers: OnboardingAnswers { model.onboardingDraft.answers }
    private var role: Role? {
        model.viewer?.role == .admin ? answers.role : model.viewer?.role
    }
    private var steps: [OnboardingStep] {
        OnboardingStep.steps(for: role, askRole: model.viewer?.role == .admin)
    }
    private var index: Int { min(model.onboardingDraft.index, steps.count - 1) }
    private var step: OnboardingStep { steps[index] }

    var body: some View {
        @Bindable var model = model
        let a = $model.onboardingDraft.answers
        let q = question(step, a)

        VStack(spacing: 0) {
            HStack(spacing: 16) {
                Button { back() } label: { Image(systemName: "chevron.left").font(.system(size: 17, weight: .semibold)) }
                    .opacity(index == 0 ? 0 : 1)
                    .disabled(index == 0)
                    .accessibilityLabel("Back")
                ProgressView(value: Double(index), total: Double(steps.count))
                    .tint(Color.accent)
                    .accessibilityLabel("Question \(index + 1) of \(steps.count)")
                Button { model.onboardingOpen = false } label: { Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)) }
                    .accessibilityLabel("Finish later")
            }
            .foregroundStyle(Color.ink)
            .frame(height: 44)
            .padding(.horizontal, 20)

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if index == 0 { SectionLabel("Your first meeting") }
                    Text(q.prompt)
                        .font(.display(28)).tracking(-0.3).foregroundStyle(Color.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if let note = q.note { Muted(note) }
                    q.body.padding(.top, 14)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .id(step)
                .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                        removal: .opacity))
            }
            .scrollDismissesKeyboard(.interactively)

            VStack(spacing: 10) {
                if let error { InlineNote(text: error, kind: .problem).frame(maxWidth: .infinity, alignment: .leading) }
                Button { next() } label: {
                    if saving { ProgressView().tint(.white) } else { Text(index == steps.count - 1 ? "Finish" : "Continue") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!q.valid || saving)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
        .background(Color.paper)
    }

    private func next() {
        error = nil
        guard index == steps.count - 1 else {
            withAnimation(.snappy(duration: 0.3)) { model.onboardingDraft.index = index + 1 }
            return
        }
        // The last answer: save the profile, then show what was heard. A
        // failed save stops here — going on would lose the answers quietly.
        saving = true
        Task {
            defer { saving = false }
            do {
                done(try await model.completeOnboarding(answers))
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func back() {
        error = nil
        withAnimation(.snappy(duration: 0.3)) { model.onboardingDraft.index = max(0, index - 1) }
    }

    // MARK: Each question

    private struct Question {
        let prompt: String
        var note: String?
        let valid: Bool
        let body: AnyView
    }

    private func question(_ step: OnboardingStep, _ a: Binding<OnboardingAnswers>) -> Question {
        let v = a.wrappedValue
        switch step {
        case .role:
            return Question(prompt: "First things first — who am I talking to?", valid: v.role != nil,
                            body: AnyView(Chips(options: [("student", "I'm a student"), ("parent", "I'm a parent")],
                                                selected: v.role.map { [$0.rawValue] } ?? [],
                                                tap: { a.wrappedValue.role = Role(rawValue: $0) })))
        case .name:
            return Question(prompt: role == .parent ? "Welcome. What should I call you?" : "Let's start easy. What should I call you?",
                            valid: !v.firstName.trimmingCharacters(in: .whitespaces).isEmpty,
                            body: AnyView(BigField(placeholder: "Your first name", text: a.firstName, content: .givenName,
                                                   autofocus: true, submit: advanceIfValid)))
        case .grade, .parentGrade:
            return Question(prompt: step == .parentGrade ? "What grade is your student in?" : "Nice to meet you, \(v.firstName.trimmingCharacters(in: .whitespaces)). What grade are you in?",
                            valid: v.grade != nil,
                            body: AnyView(Chips(options: [9, 10, 11, 12].map { ("\($0)", "\($0)th grade") },
                                                selected: v.grade.map { ["\($0)"] } ?? [],
                                                tap: { a.wrappedValue.grade = Int($0) })))
        case .gpa:
            return Question(prompt: "What's your GPA? Rough numbers are fine — we can refine later.",
                            note: "Unweighted is on a 4.0 scale. If your school weights honors/AP classes, add that too.",
                            valid: parseNumber(v.gpaUnweighted, OnboardingRange.gpa) != nil && !isBadNumber(v.gpaWeighted, OnboardingRange.gpa),
                            body: AnyView(VStack(alignment: .leading, spacing: 22) {
                                BigField(label: "Unweighted (out of 4.0)", placeholder: "3.6", text: a.gpaUnweighted, keyboard: .decimalPad,
                                         error: isBadNumber(v.gpaUnweighted, OnboardingRange.gpa) ? "Just the number, on a 0–5.0 scale — like 3.6." : nil,
                                         autofocus: true)
                                BigField(label: "Weighted — optional", placeholder: "4.1", text: a.gpaWeighted, keyboard: .decimalPad,
                                         error: isBadNumber(v.gpaWeighted, OnboardingRange.gpa) ? "Just the number, on a 0–5.0 scale — like 4.1." : nil)
                            }))
        case .rigor:
            let r = OnboardingRange.courses
            return Question(prompt: "How many advanced courses have you taken (or are in now)?",
                            note: "Colleges read rigor in the context of what your school offers. There's no magic number.",
                            valid: (parseNumber(v.apCount, r) != nil || parseNumber(v.honorsCount, r) != nil)
                                && !isBadNumber(v.apCount, r) && !isBadNumber(v.honorsCount, r),
                            body: AnyView(VStack(alignment: .leading, spacing: 22) {
                                BigField(label: "AP or IB courses", placeholder: "0", text: a.apCount, keyboard: .numberPad,
                                         error: isBadNumber(v.apCount, r) ? "A whole number, 0–30." : nil, autofocus: true)
                                BigField(label: "Honors courses", placeholder: "0", text: a.honorsCount, keyboard: .numberPad,
                                         error: isBadNumber(v.honorsCount, r) ? "A whole number, 0–30." : nil)
                            }))
        case .testing:
            let range = v.testChoice == .act ? OnboardingRange.act : OnboardingRange.sat
            return Question(prompt: "Where are you with the SAT or ACT?",
                            note: "Plenty of strong schools are test-optional. Not having a score yet is a normal answer.",
                            valid: v.testChoice == .notYet || (v.testChoice != nil && parseNumber(v.testScore, range) != nil),
                            body: AnyView(VStack(alignment: .leading, spacing: 22) {
                                Chips(options: [("sat", "I have an SAT score"), ("act", "I have an ACT score"), ("notYet", "Haven't tested yet")],
                                      selected: v.testChoice.map { [$0.rawValue] } ?? [],
                                      tap: { a.wrappedValue.testChoice = OnboardingAnswers.TestChoice(rawValue: $0) })
                                if v.testChoice == .sat || v.testChoice == .act {
                                    BigField(label: v.testChoice == .sat ? "SAT score" : "ACT score",
                                             placeholder: v.testChoice == .sat ? "1310" : "29", text: a.testScore, keyboard: .numberPad,
                                             error: isBadNumber(v.testScore, range) ? (v.testChoice == .sat ? "SAT scores run 400–1600." : "ACT scores run 1–36.") : nil)
                                }
                            }))
        case .majors:
            return Question(prompt: "Any idea what you might want to study?",
                            note: "“Undecided” is a first-class answer here. Most students change their minds anyway — being honest about it puts you ahead.",
                            valid: !v.majors.isEmpty,
                            body: AnyView(Chips(options: OnboardingChoices.majors.map { ($0, $0) }, selected: v.majors,
                                                tap: { a.wrappedValue.toggle(\.majors, $0) })))
        case .activities:
            return Question(prompt: "What do you actually spend time on outside class?",
                            note: "Clubs, jobs, caring for family, art, sports, games you take seriously — all of it counts. Depth matters more than a long list.",
                            valid: !v.activities.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                            body: AnyView(TextArea(placeholder: "e.g. Science Olympiad captain, part-time job at a vet clinic, teach myself guitar…",
                                                   text: a.activities, minLines: 4)
                                .accessibilityIdentifier("onboarding.activities")))
        case .homeState:
            return Question(prompt: role == .parent ? "What state does your family live in?" : "What state do you live in?",
                            note: "Public colleges charge much less if you live in their state, and some give students from nearby states a discount (like WUE in the West). This is how I work out what you'd really pay.",
                            valid: v.homeState != nil,
                            body: AnyView(StateChooser(selection: a.homeState)))
        case .regions:
            return Question(prompt: "Where in the country would you consider living?",
                            note: "Pick everything you're open to — casting wide here often surfaces great, less-obvious options.",
                            valid: !v.regions.isEmpty,
                            body: AnyView(Chips(options: OnboardingChoices.regions.map { ($0.id, $0.label) }, selected: v.regions,
                                                tap: { a.wrappedValue.toggle(\.regions, $0) })))
        case .settings:
            return Question(prompt: "What kind of place do you picture yourself in?", valid: !v.settings.isEmpty,
                            body: AnyView(Chips(options: OnboardingChoices.settings.map { ($0.id, $0.label) }, selected: v.settings,
                                                tap: { a.wrappedValue.toggle(\.settings, $0) })))
        case .budget, .parentBudget:
            return Question(prompt: step == .parentBudget
                                ? "Let's talk about budget — honestly. What could your family put toward college each year?"
                                : "What could your family realistically put toward college each year?",
                            note: "This stays private and just helps me show you real net prices instead of scary sticker prices. Financial aid changes this math a lot.",
                            valid: v.budget != nil,
                            body: AnyView(VStack(alignment: .leading, spacing: 22) {
                                Chips(options: OnboardingChoices.budgets.map { ($0.label, $0.label) },
                                      selected: v.budget.map { [$0] } ?? [], tap: { a.wrappedValue.budget = $0 })
                                if step == .budget {
                                    VStack(alignment: .leading, spacing: 10) {
                                        SectionLabel("Planning to file the FAFSA (federal aid form)?")
                                        Chips(options: [("yes", "Yes / probably"), ("no", "No")],
                                              selected: [v.fafsa ? "yes" : "no"], tap: { a.wrappedValue.fafsa = $0 == "yes" })
                                    }
                                }
                            }))
        case .values:
            return Question(prompt: "Last one. What matters to you in a campus community?", valid: !v.values.isEmpty,
                            body: AnyView(Chips(options: OnboardingChoices.values.map { ($0.id, $0.label) }, selected: v.values,
                                                tap: { a.wrappedValue.toggle(\.values, $0) })))
        case .relationship:
            return Question(prompt: "What's your relationship to your student?", valid: v.relationship != nil,
                            body: AnyView(Chips(options: OnboardingChoices.relationships.map { ($0, $0) },
                                                selected: v.relationship.map { [$0] } ?? [], tap: { a.wrappedValue.relationship = $0 })))
        case .priorities:
            return Question(prompt: "What matters most to you in this process?", valid: !v.priorities.isEmpty,
                            body: AnyView(Chips(options: OnboardingChoices.priorities.map { ($0, $0) }, selected: v.priorities,
                                                tap: { a.wrappedValue.toggle(\.priorities, $0) })))
        case .worry:
            return Question(prompt: "What's your biggest worry right now? Say it plainly.",
                            note: "Whatever it is, you're almost certainly not alone in it.",
                            valid: !v.worry.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                            body: AnyView(TextArea(placeholder: "e.g. That we can't afford the schools she's dreaming about…",
                                                   text: a.worry, minLines: 4)
                                .accessibilityIdentifier("onboarding.worry")))
        case .involvement:
            return Question(prompt: "How involved do you want to be?",
                            note: "The research is consistent: supported-but-not-managed students do best. Any of these can work.",
                            valid: v.involvement != nil,
                            body: AnyView(Chips(options: OnboardingChoices.involvement.map { ($0.id, $0.label) },
                                                selected: v.involvement.map { [$0] } ?? [], tap: { a.wrappedValue.involvement = $0 })))
        }
    }

    private func advanceIfValid() {
        if question(step, Binding(get: { model.onboardingDraft.answers }, set: { model.onboardingDraft.answers = $0 })).valid { next() }
    }
}

// MARK: Summary

private struct OnboardingSummary: View {
    @Environment(AppModel.self) private var model
    let summary: String
    let back: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    SectionLabel("Your profile")
                    TwoTone(lead: "Here's what I'm hearing", rest: "about you.")
                    CardView(tint: .lavender) {
                        Text(summary).font(.system(size: 17)).foregroundStyle(Color.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Muted("Saved, and private to you. If I got something wrong, go back and change it — your answers are still there.", size: 14)
                }
                .padding(20)
                .padding(.top, 24)
            }
            VStack(spacing: 10) {
                Button("That's me — let's go") { model.finishOnboarding() }
                    .buttonStyle(PrimaryButtonStyle())
                Button("Change an answer", action: back)
                    .buttonStyle(LinkButtonStyle(color: .grayStrong))
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
        .background(Color.paper)
    }
}

// MARK: Inputs

/// Chips that wrap — one or many picked, depending on what `tap` does.
private struct Chips: View {
    let options: [(id: String, label: String)]
    let selected: [String]
    let tap: (String) -> Void

    var body: some View {
        FlowLayout(spacing: 10) {
            ForEach(options, id: \.id) { o in
                Chip(label: o.label, active: selected.contains(o.id)) { tap(o.id) }
            }
        }
    }
}

/// Every state, filtered as they type — a menu of 56 is a long scroll in
/// a small box.
private struct StateChooser: View {
    @Binding var selection: String?
    @State private var query = ""

    private var matches: [(code: String, name: String)] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return USStates.all.sorted { $0.name < $1.name } }
        return USStates.all
            .filter { $0.name.localizedCaseInsensitiveContains(q) || $0.code.caseInsensitiveCompare(q) == .orderedSame }
            .sorted { $0.name < $1.name }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            BoxField(placeholder: "Search states", text: $query)
            VStack(spacing: 0) {
                ForEach(matches, id: \.code) { state in
                    Button { selection = state.code } label: {
                        HStack {
                            Text(state.name).foregroundStyle(Color.ink)
                            Spacer()
                            if selection == state.code {
                                Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.accent)
                            }
                        }
                        .font(.system(size: 16))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 13)
                        .background(selection == state.code ? Color.lavender : Color.clear)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selection == state.code ? .isSelected : [])
                    if state.code != matches.last?.code { Divider().overlay(Color.hairline).padding(.leading, 16) }
                }
                if matches.isEmpty {
                    Text("No state matches “\(query)”.").font(.system(size: 15)).foregroundStyle(Color.grayStrong).padding(16)
                }
            }
            .surfaceCard(radius: Radius.tile)
            .clipShape(RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
        }
    }
}

/// A large ruled field — the web's onboarding input, big enough to feel
/// like an answer rather than a form.
private struct BigField: View {
    var label: String?
    let placeholder: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default
    var content: UITextContentType?
    var error: String?
    var autofocus = false
    var submit: () -> Void = {}
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let label { SectionLabel(label) }
            TextField(placeholder, text: $text)
                .font(.system(size: 26, weight: .medium))
                .keyboardType(keyboard)
                .textContentType(content)
                .textInputAutocapitalization(keyboard == .default ? .words : .never)
                .autocorrectionDisabled()
                .submitLabel(.next)
                .onSubmit(submit)
                .focused($focused)
                .padding(.vertical, 6)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(error != nil || focused ? Color.ink : Color.hairline).frame(height: 1)
                }
            if let error { InlineNote(text: error, kind: .problem) }
        }
        .task {
            // After the page's slide-in, or the keyboard fights the animation.
            guard autofocus else { return }
            try? await Task.sleep(for: .milliseconds(350))
            focused = true
        }
    }
}
