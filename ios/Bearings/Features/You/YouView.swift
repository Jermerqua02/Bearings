import SwiftUI

/// You — what used to be the Planner, and now more: everything the
/// counselor knows about the student. What they've told it in conversation,
/// filed by topic and correctable line by line, alongside the record —
/// courses and grades, activities, and what to do next summer. All of it
/// feeds the counselor's advice and the application packet.
///
/// Reached from the profile and from the counselor, not a tab.
struct YouView: View {
    @Environment(AppModel.self) private var model
    @State private var section: Section
    @State private var summary: PlannerSummary?

    enum Section: Hashable { case about, courses, activities, opportunities }

    init(start: Section = .about) { _section = State(initialValue: start) }

    var body: some View {
        Group {
            if model.isParent {
                Page {
                    TwoTone(lead: "This one belongs", rest: "to your student.")
                    Muted("What they tell their counselor, their courses and their activities are the part of this process where being watched is least useful — so it stays theirs. It feeds their application profile automatically; nothing gets re-typed in senior year.")
                    Muted("What you can see is on your Home tab: their list, where each application stands, what's due next, and the aid comparison once offers arrive.")
                }
            } else {
                Page(spacing: 22) {
                    TwoTone(lead: "You,", rest: "as your counselor knows you.")
                    SegmentTabs(tabs: [(.about, "About you"), (.courses, "Courses"), (.activities, "Activities"),
                                       (.opportunities, "Opportunities")],
                                selection: $section)
                    switch section {
                    case .about: MemorySection()
                    case .courses: CoursesSection(summary: summary)
                    case .activities: ActivitiesSection(limits: summary?.limits)
                    case .opportunities: OpportunitiesSection()
                    }
                }
            }
        }
        .navigationTitle("You")
        .navigationBarTitleDisplayMode(.inline)
        .paperChrome()
        .task(id: model.plannerRevision) {
            guard !model.isParent else { return }
            summary = try? await model.api.get("/api/v1/planner")
        }
    }
}

struct YouRoute: Hashable {}

// MARK: Courses

private struct CoursesSection: View {
    @Environment(AppModel.self) private var model
    let summary: PlannerSummary?
    /// The sheet: adding to a year, or editing one course.
    @State private var form: CourseFormTarget?
    /// Years whose courses are unlocked for editing. Grades are records,
    /// so they read as fixed text until the student asks to change them.
    @State private var editingYears: Set<Int> = []

    var body: some View {
        let courses = model.snapshot?.coursePlan ?? []
        VStack(alignment: .leading, spacing: 22) {
            TranscriptPanel()
            numbers
            ForEach([9, 10, 11, 12], id: \.self) { year in
                let rows = courses.filter { $0.year == year }
                    .sorted { ($0.subject.order, $0.name, $0.term ?? "") < ($1.subject.order, $1.name, $1.term ?? "") }
                VStack(alignment: .leading, spacing: 10) {
                    let editing = editingYears.contains(year)
                    SectionHeader(icon: "\(year - 8).circle", title: "\(year)th grade",
                                  subtitle: rows.isEmpty ? nil : "\(rows.count) course\(rows.count == 1 ? "" : "s")") {
                        HStack(spacing: 8) {
                            if !rows.isEmpty {
                                Button(editing ? "Done" : "Edit") {
                                    withAnimation(.snappy) {
                                        if editing { editingYears.remove(year) } else { editingYears.insert(year) }
                                    }
                                }
                                .buttonStyle(OutlineButtonStyle(compact: true))
                                .accessibilityLabel(editing ? "Done editing \(year)th grade" : "Edit \(year)th-grade courses")
                            }
                            RoundIconButton(icon: "plus", fill: .highlight, label: "Add a \(year)th-grade course") {
                                form = .add(year: year)
                            }
                        }
                    }
                    if rows.isEmpty {
                        Muted("Nothing yet.", size: 14)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(rows.enumerated()), id: \.element.id) { i, course in
                                if i > 0 { Divider().overlay(Color.hairline) }
                                CourseRow(course: course, editing: editing) { form = .edit(course) }
                            }
                        }
                        .padding(.horizontal, 14)
                        .surfaceCard()
                    }
                }
            }
        }
        .sheet(item: $form) { target in
            CourseFormSheet(target: target, grades: summary?.gradeOptions ?? [])
                .presentationDetents([.large])
                .presentationBackground(Color.paper)
        }
    }

    /// The GPA a transcript prints for itself beats anything computed —
    /// that's the figure a student quotes to a college.
    @ViewBuilder
    private var numbers: some View {
        if let summary {
            let reported = summary.reported
            let computed = summary.computed
            VStack(spacing: 10) {
                TileRow {
                    StatTile(label: "Unweighted GPA", value: Format.gpa(reported?.unweighted ?? computed.unweighted),
                             note: reported?.unweighted != nil
                                ? "As printed on your transcript\(reported?.credits.map { " (over \(Format.gpa($0)) credits)" } ?? ""). The figure your school reports."
                                : "From the courses below.",
                             tint: .highlight, icon: "graduationcap")
                    StatTile(label: "Weighted GPA", value: Format.gpa(reported?.weighted ?? computed.weighted),
                             note: reported?.weighted != nil ? "As printed on your transcript." : "AP and IB add a point, honors half.",
                             tint: .surface, icon: "scalemass")
                }
                if let r = reported?.unweighted, let c = computed.unweighted, abs(r - c) >= 0.05 {
                    Muted("Averaging the courses below gives \(Format.gpa(c)) — schools count credits and exclude pass/fail work, so the two rarely match exactly.", size: 13)
                }
                Panel(icon: "chart.line.uptrend.xyaxis", title: "Rigor read", subtitle: "\(summary.rigor.advanced) AP/IB · \(summary.rigor.ahead) still ahead", tint: .surface) {
                    let n = summary.rigor.advanced
                    Text(n >= 6 ? "That's competitive for most selective schools."
                         : n >= 3 ? "A solid arc — depth in your strong subjects matters more than count."
                         : "Room to add rigor where you're strongest — one subject at a time.")
                        .font(.system(size: 15))
                }
            }
        }
    }
}

enum CourseFormTarget: Identifiable {
    case add(year: Int)
    case edit(Course)

    var id: String {
        switch self {
        case .add(let year): "add-\(year)"
        case .edit(let course): course.id
        }
    }
}

private extension Course.Subject {
    var order: Int { Course.Subject.allCases.firstIndex(of: self) ?? 0 }
}

/// One course. Read-only by default — the grade is a record, shown as a
/// fixed badge. In edit mode the row offers edit and remove instead.
private struct CourseRow: View {
    @Environment(AppModel.self) private var model
    let course: Course
    let editing: Bool
    let edit: () -> Void
    @State private var confirmingRemove = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            if editing {
                Button { confirmingRemove = true } label: {
                    Image(systemName: "minus.circle.fill").font(.system(size: 20)).foregroundStyle(Color.reach)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove \(course.name)")
                .transition(.move(edge: .leading).combined(with: .opacity))
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(course.name).font(.system(size: 15, weight: .medium))
                    .foregroundStyle(course.status == .planned ? Color.grayMid : Color.ink)
                // The term is what tells two rows for one class apart — a
                // semestered course is two grades, not a duplicate.
                Text([course.subject.rawValue, course.level.label, course.term].compactMap { $0 }
                    .joined(separator: " · ").uppercased())
                    .font(.system(size: 11, weight: .medium)).tracking(0.5).foregroundStyle(Color.grayMid)
            }
            Spacer(minLength: 8)
            if editing {
                RoundIconButton(icon: "pencil", fill: .mist, size: 32, label: "Edit \(course.name)", action: edit)
            } else {
                badge
            }
        }
        .padding(.vertical, 11)
        .confirmationDialog("Remove \(course.name)?", isPresented: $confirmingRemove, titleVisibility: .visible) {
            Button("Remove course", role: .destructive) { model.removeCourse(course.id) }
        }
    }

    /// Grade if there is one; otherwise where the course stands.
    @ViewBuilder
    private var badge: some View {
        switch course.status {
        case .completed:
            Text(course.grade.flatMap { $0.isEmpty ? nil : $0 } ?? "—")
                .font(.system(size: 15, weight: .semibold))
                .frame(minWidth: 44)
                .padding(.vertical, 6)
                .background(course.grade == nil ? Color.fill : Color.mist, in: Capsule())
                .accessibilityLabel(course.grade.map { "Grade \($0)" } ?? "No grade recorded")
        case .inProgress:
            Text("Taking now").font(.system(size: 12, weight: .medium)).foregroundStyle(Color.ink)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Color.highlightSoft, in: Capsule())
        case .planned:
            Text("Planned").font(.system(size: 12, weight: .medium)).foregroundStyle(Color.grayStrong)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .overlay(Capsule().stroke(Color.hairline))
        }
    }
}

/// Add a course or edit one — the same form either way, so typing in a
/// finished course with its grade is as easy as planning one.
private struct CourseFormSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let target: CourseFormTarget
    let grades: [String]

    @State private var name = ""
    @State private var subject: Course.Subject = .english
    @State private var level: Course.Level = .regular
    @State private var status: Course.Status = .completed
    @State private var grade = ""
    @State private var saving = false

    private var year: Int {
        switch target {
        case .add(let y): y
        case .edit(let c): c.year
        }
    }

    private var isEdit: Bool { if case .edit = target { true } else { false } }

    var body: some View {
        NavigationStack {
            Page(spacing: 22) {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Course")
                    BoxField(placeholder: "e.g. AP Biology", text: $name)
                }
                group("Status") {
                    ForEach(Course.Status.allCases, id: \.self) { s in
                        Chip(label: s.label, active: status == s) { status = s }
                    }
                }
                if status == .completed {
                    group("Grade") {
                        ForEach(grades, id: \.self) { g in
                            Chip(label: g, active: grade == g) { grade = grade == g ? "" : g }
                        }
                    }
                }
                group("Level") {
                    ForEach(Course.Level.allCases, id: \.self) { l in
                        Chip(label: l.label, active: level == l) { level = l }
                    }
                }
                group("Subject") {
                    ForEach(Course.Subject.allCases, id: \.self) { s in
                        Chip(label: s.rawValue, active: subject == s) { subject = s }
                    }
                }
            }
            .navigationTitle(isEdit ? "Edit course" : "Add a \(year)th-grade course")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEdit ? "Save" : "Add", action: save)
                        .fontWeight(.semibold)
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
        }
        .onAppear {
            if case .edit(let c) = target {
                name = c.name; subject = c.subject; level = c.level; status = c.status; grade = c.grade ?? ""
            }
        }
    }

    private func group<C: View>(_ title: String, @ViewBuilder _ chips: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(title)
            FlowLayout { chips() }
        }
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        let finalGrade = status == .completed && !grade.isEmpty ? grade : nil
        switch target {
        case .add(let y):
            saving = true
            Task {
                await model.addCourse(year: y, subject: subject, name: trimmed, level: level,
                                      status: status, grade: finalGrade)
                dismiss()
            }
        case .edit(let c):
            model.updateCourse(c.id) {
                $0.name = trimmed; $0.subject = subject; $0.level = level
                $0.status = status; $0.grade = finalGrade
            }
            dismiss()
        }
    }
}

// MARK: Activities

private struct ActivitiesSection: View {
    @Environment(AppModel.self) private var model
    let limits: PlannerSummary.Limits?
    @State private var name = ""
    @State private var role = ""

    var body: some View {
        let ordered = model.orderedActivities
        let slots = limits?.activitySlots ?? 10
        VStack(alignment: .leading, spacing: 14) {
            CardView(tint: .lavender) {
                Text("Depth beats breadth — I'll say it every time. Three activities with growth and responsibility read better than nine memberships. This log feeds your applications automatically senior year.")
                    .font(.system(size: 15))
            }
            if ordered.count > 1 {
                Muted("Applications ask for these in order of importance to you, and only the first \(slots) fit. Put the one you'd talk about first at the top.", size: 14)
            }
            ForEach(Array(ordered.enumerated()), id: \.element.id) { i, a in
                ActivityCard(activity: a, rank: i, count: ordered.count, slots: slots,
                             descriptionLimit: limits?.descriptionChars ?? 150)
            }
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Add an activity")
                BoxField(placeholder: "Activity", text: $name)
                BoxField(placeholder: "Your role", text: $role)
                Button("Add") {
                    let n = name.trimmingCharacters(in: .whitespaces), r = role.trimmingCharacters(in: .whitespaces)
                    name = ""; role = ""
                    Task { await model.addActivity(name: n, role: r) }
                }
                .buttonStyle(OutlineButtonStyle(compact: true))
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.top, 6)
        }
    }
}

private struct ActivityCard: View {
    @Environment(AppModel.self) private var model
    let activity: Activity
    let rank: Int
    let count: Int
    let slots: Int
    let descriptionLimit: Int
    @State private var draft = ""
    @FocusState private var editing: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                if count > 1 {
                    VStack(spacing: 2) {
                        Button { model.moveActivity(activity.id, by: -1) } label: { Image(systemName: "chevron.up") }
                            .disabled(rank == 0).accessibilityLabel("Move \(activity.name) up")
                        Text("\(rank + 1)").font(.system(size: 13, weight: .medium)).monospacedDigit()
                            .foregroundStyle(rank < slots ? Color.grayMid : Color.reach)
                        Button { model.moveActivity(activity.id, by: 1) } label: { Image(systemName: "chevron.down") }
                            .disabled(rank == count - 1).accessibilityLabel("Move \(activity.name) down")
                    }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.grayStrong)
                    .buttonStyle(.plain)
                    .frame(width: 28)
                }
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(activity.name).font(.system(size: 16, weight: .semibold))
                        if activity.leadership {
                            Text("LEADERSHIP").font(.system(size: 10, weight: .semibold)).tracking(0.8).foregroundStyle(Color.accent)
                        }
                    }
                    Text("\(activity.role.isEmpty ? "—" : activity.role) · \(Int(activity.hoursPerWeek)) hr/wk · \(Int(activity.weeksPerYear)) wk/yr\(activity.yearsInvolved.isEmpty ? "" : " · grades \(activity.yearsInvolved.map(String.init).joined(separator: ", "))")")
                        .font(.system(size: 13)).foregroundStyle(Color.grayMid)
                    if rank >= slots {
                        Text("Past the \(slots)-slot limit — won't fit on the application.")
                            .font(.system(size: 13)).foregroundStyle(Color.reach)
                    }
                }
                Spacer(minLength: 0)
                Menu {
                    Button(activity.leadership ? "Unmark leadership" : "Mark as leadership role") {
                        model.updateActivity(activity.id) { $0.leadership.toggle() }
                    }
                    Menu("Grades involved") {
                        ForEach([9, 10, 11, 12], id: \.self) { g in
                            Button {
                                model.updateActivity(activity.id) {
                                    if $0.yearsInvolved.contains(g) { $0.yearsInvolved.removeAll { $0 == g } } else { $0.yearsInvolved = ($0.yearsInvolved + [g]).sorted() }
                                }
                            } label: {
                                if activity.yearsInvolved.contains(g) { Label("\(g)th", systemImage: "checkmark") } else { Text("\(g)th") }
                            }
                        }
                    }
                    Button("Remove", role: .destructive) { model.removeActivity(activity.id) }
                } label: {
                    Image(systemName: "ellipsis").foregroundStyle(Color.grayMid).frame(width: 32, height: 32)
                }
                .accessibilityLabel("More for \(activity.name)")
            }

            TextField("What did you actually do? Specifics beat titles.", text: $draft, axis: .vertical)
                .lineLimit(2...8)
                .focused($editing)
                .font(.system(size: 15))
                .padding(10)
                .background(Color.paper, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Radius.control, style: .continuous).stroke(editing ? Color.ink : Color.clear))
                .accessibilityLabel("Description for \(activity.name)")
            // The cut to 150 characters has to happen somewhere; better here,
            // with time, than inside the real form on deadline day.
            let over = draft.count - descriptionLimit
            Text("\(draft.count)/\(descriptionLimit)\(over > 0 ? " — \(over) over" : "")")
                .font(.system(size: 12, weight: over > 0 ? .medium : .regular)).monospacedDigit()
                .foregroundStyle(over > 0 ? Color.reach : Color.grayMid)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(16)
        .surfaceCard()
        .onAppear { draft = activity.description }
        // Saved when the student leaves the field, not on every keystroke.
        .onChange(of: editing) { _, now in
            if !now && draft != activity.description { model.updateActivity(activity.id) { $0.description = draft } }
        }
    }
}

// MARK: Opportunities

private struct OpportunitiesSection: View {
    @Environment(AppModel.self) private var model
    @State private var all: [Opportunity] = []
    @State private var freeOnly = false
    @State private var type: String?

    private static let costOrder = ["free": 0, "stipend": 1, "low-cost": 2, "paid": 3]

    var body: some View {
        let shown = all
            .filter { !freeOnly || $0.cost == "free" || $0.cost == "stipend" }
            .filter { type == nil || $0.type == type }
            .sorted { (Self.costOrder[$0.cost] ?? 9) < (Self.costOrder[$1.cost] ?? 9) }
        VStack(alignment: .leading, spacing: 14) {
            FlowLayout {
                Chip(label: "Free or paid-to-you only", active: freeOnly) { freeOnly.toggle() }
                ForEach(["program", "internship", "research", "job", "volunteering"], id: \.self) { t in
                    Chip(label: t.capitalized, active: type == t) { type = type == t ? nil : t }
                }
            }
            ForEach(shown) { o in
                CardView {
                    HStack(alignment: .firstTextBaseline) {
                        Text(o.name).font(.system(size: 16, weight: .semibold))
                        Spacer()
                        Text(o.cost == "stipend" ? "PAYS YOU" : o.cost.replacingOccurrences(of: "-", with: " ").uppercased())
                            .font(.system(size: 10, weight: .semibold)).tracking(0.8)
                            .foregroundStyle(o.cost == "free" || o.cost == "stipend" ? Color.accent : Color.grayMid)
                    }
                    SectionLabel("\(o.org) · \(o.location)\(o.selective ? " · selective" : "")")
                    Muted(o.description)
                }
            }
            Muted("A note on paid programs: cost rarely equals admissions value. The free and selective ones signal more; the self-started ones often signal most.", size: 14)
        }
        .task { if all.isEmpty { all = (try? await model.api.get("/api/v1/opportunities")) ?? [] } }
    }
}
