import SwiftUI

/// The planner — app/(app)/planner/page.tsx. The student's record so far:
/// courses and grades (read off a transcript if they upload one), the
/// activity log in the order applications ask for, and what to do next
/// summer. Everything here feeds the counselor and the application packet.
struct PlannerView: View {
    @Environment(AppModel.self) private var model
    @State private var section: Section = .courses
    @State private var summary: PlannerSummary?

    enum Section: Hashable { case courses, activities, opportunities }

    var body: some View {
        NavigationStack {
            Group {
                if model.isParent {
                    Page {
                        SectionLabel("Planner")
                        TwoTone(lead: "This one belongs", rest: "to your student.")
                        Muted("Course choices and activities are the part of this process where being watched is least useful — so the planner stays theirs. It feeds their application profile automatically; nothing gets re-typed in senior year.")
                        Muted("What you can see is on your Home tab: their list, where each application stands, what's due next, and the aid comparison once offers arrive.")
                    }
                } else {
                    Page(spacing: 22) {
                        SectionLabel("Planner")
                        if model.snapshot?.profile?.mode == .build {
                            TwoTone(lead: "What should I be doing?", rest: "That's the right question.")
                        } else {
                            TwoTone(lead: "Your record so far", rest: "— and what's still ahead.")
                        }
                        SegmentTabs(tabs: [(.courses, "Courses"), (.activities, "Activities"),
                                           (.opportunities, "Opportunities")],
                                    selection: $section)
                        switch section {
                        case .courses: CoursesSection(summary: summary)
                        case .activities: ActivitiesSection(limits: summary?.limits)
                        case .opportunities: OpportunitiesSection()
                        }
                    }
                }
            }
            .navigationTitle("Planner")
            .navigationBarTitleDisplayMode(.inline)
            .paperChrome()
        }
        .task(id: model.plannerRevision) {
            guard !model.isParent else { return }
            summary = try? await model.api.get("/api/v1/planner")
        }
    }
}

// MARK: Courses

private struct CoursesSection: View {
    @Environment(AppModel.self) private var model
    let summary: PlannerSummary?
    @State private var addingYear: Int?

    var body: some View {
        let courses = model.snapshot?.coursePlan ?? []
        VStack(alignment: .leading, spacing: 22) {
            TranscriptPanel()
            numbers
            ForEach([9, 10, 11, 12], id: \.self) { year in
                let rows = courses.filter { $0.year == year }
                    .sorted { ($0.subject.order, $0.name, $0.term ?? "") < ($1.subject.order, $1.name, $1.term ?? "") }
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        SectionLabel("\(year)th grade")
                        Spacer()
                        Button { addingYear = year } label: { Label("Add course", systemImage: "plus") }
                            .buttonStyle(LinkButtonStyle(color: .accent))
                    }
                    if rows.isEmpty {
                        Muted("Nothing yet.", size: 14)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(rows.enumerated()), id: \.element.id) { i, course in
                                if i > 0 { Divider().overlay(Color.hairline) }
                                CourseRow(course: course, grades: summary?.gradeOptions ?? [])
                            }
                        }
                        .padding(.horizontal, 14)
                        .background(Color.surface, in: RoundedRectangle(cornerRadius: 6))
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.hairline))
                    }
                }
            }
        }
        .sheet(item: Binding(get: { addingYear.map(YearRef.init) }, set: { addingYear = $0?.year })) { ref in
            AddCourseSheet(year: ref.year)
                .presentationDetents([.medium])
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
            VStack(spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    CardView {
                        SectionLabel("Unweighted GPA")
                        Text(Format.gpa(reported?.unweighted ?? computed.unweighted)).font(.system(size: 26, weight: .semibold))
                        Text(reported?.unweighted != nil
                             ? "As printed on your transcript\(reported?.credits.map { " (over \(Format.gpa($0)) credits)" } ?? ""). The figure your school reports."
                             : "From the courses below.")
                            .font(.system(size: 12)).foregroundStyle(Color.grayMid)
                    }
                    CardView {
                        SectionLabel("Weighted GPA")
                        Text(Format.gpa(reported?.weighted ?? computed.weighted)).font(.system(size: 26, weight: .semibold))
                        Text(reported?.weighted != nil ? "As printed on your transcript." : "AP and IB add a point, honors half.")
                            .font(.system(size: 12)).foregroundStyle(Color.grayMid)
                    }
                }
                if let r = reported?.unweighted, let c = computed.unweighted, abs(r - c) >= 0.05 {
                    Muted("Averaging the courses below gives \(Format.gpa(c)) — schools count credits and exclude pass/fail work, so the two rarely match exactly.", size: 13)
                }
                CardView {
                    SectionLabel("Rigor read")
                    let n = summary.rigor.advanced
                    Text("\(n) AP/IB total (\(summary.rigor.ahead) still ahead). "
                         + (n >= 6 ? "That's competitive for most selective schools."
                            : n >= 3 ? "A solid arc — depth in your strong subjects matters more than count."
                            : "Room to add rigor where you're strongest — one subject at a time."))
                        .font(.system(size: 15))
                }
            }
        }
    }
}

private struct YearRef: Identifiable { let year: Int; var id: Int { year } }

private extension Course.Subject {
    var order: Int { Course.Subject.allCases.firstIndex(of: self) ?? 0 }
}

private struct CourseRow: View {
    @Environment(AppModel.self) private var model
    let course: Course
    let grades: [String]

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(course.name).font(.system(size: 15, weight: .medium))
                    .foregroundStyle(course.status == .planned ? Color.grayMid : Color.ink)
                // The term is what tells two rows for one class apart — a
                // semestered course is two grades, not a duplicate.
                Text([course.subject.rawValue, course.level.label, course.term,
                      course.status == .planned ? "planned" : course.status == .inProgress ? "now" : nil]
                    .compactMap { $0 }.joined(separator: " · ").uppercased())
                    .font(.system(size: 11, weight: .medium)).tracking(0.5).foregroundStyle(Color.grayMid)
            }
            Spacer(minLength: 8)
            if course.status == .completed {
                SelectBox(options: [("", "—")] + grades.map { ($0, $0) },
                          selection: Binding(get: { course.grade ?? "" },
                                             set: { g in model.updateCourse(course.id) { $0.grade = g.isEmpty ? nil : g } }),
                          compact: true)
                    .frame(width: 78)
                    .accessibilityLabel("Grade for \(course.name)")
            } else {
                Button(course.status == .planned ? "Start" : "Finish") {
                    model.updateCourse(course.id) { $0.status = course.status == .planned ? .inProgress : .completed }
                }
                .buttonStyle(OutlineButtonStyle(compact: true))
                .accessibilityLabel(course.status == .planned ? "Mark \(course.name) as in progress" : "Mark \(course.name) as completed")
            }
            Menu {
                Button("Remove course", role: .destructive) { model.removeCourse(course.id) }
            } label: {
                Image(systemName: "ellipsis").foregroundStyle(Color.grayMid).frame(width: 28, height: 36)
            }
            .accessibilityLabel("More for \(course.name)")
        }
        .padding(.vertical, 10)
    }
}

private struct AddCourseSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let year: Int
    @State private var name = ""
    @State private var subject: Course.Subject = .english
    @State private var level: Course.Level = .regular
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Page(spacing: 20) {
                BoxField(placeholder: "Course name", text: $name)
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Subject")
                    FlowLayout {
                        ForEach(Course.Subject.allCases, id: \.self) { s in
                            Chip(label: s.rawValue, active: subject == s) { subject = s }
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Level")
                    FlowLayout {
                        ForEach(Course.Level.allCases, id: \.self) { l in
                            Chip(label: l.label, active: level == l) { level = l }
                        }
                    }
                }
            }
            .navigationTitle("Add a \(year)th-grade course")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        saving = true
                        Task {
                            await model.addCourse(year: year, subject: subject,
                                                  name: name.trimmingCharacters(in: .whitespaces), level: level)
                            dismiss()
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
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
            CardView(tint: .accentSoft, border: .accent.opacity(0.3)) {
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
                .background(Color.paper, in: RoundedRectangle(cornerRadius: 4))
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(editing ? Color.ink : Color.hairline))
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
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.hairline))
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
                            .foregroundStyle(o.cost == "free" || o.cost == "stipend" ? Color.target : Color.grayMid)
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
